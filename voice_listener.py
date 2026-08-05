import speech_recognition as sr
import json
import sys
import time
import os
import threading
import queue

SPEAKING_FLAG = '/tmp/ultron_buddy_speaking'

def is_buddy_speaking() -> bool:
    return os.path.exists(SPEAKING_FLAG)

# Command keywords — implicit activation when Boss speaks
COMMAND_KEYWORDS = [
    "search", "find", "list", "show", "get", "open", "check",
    "jobs", "job", "linkedin", "indeed", "resume", "apply",
    "weather", "news", "briefing", "status", "health",
    "remember", "recall", "save", "forget",
    "help", "what", "how", "when", "where", "who", "why",
    "please", "can you", "could you", "tell me", "give me",
    "dashboard", "browser", "email", "mail", "inbox",
    "good morning", "good night", "hello", "hi", "hey",
    "stop", "wait", "hold on", "pause", "shut up", "quiet", "cancel",
    "listen", "silence", "enough", "halt", "cut", "never mind", "stay quiet"
]

INTERRUPT_KEYWORDS = [
    "stop", "wait", "hold on", "pause", "shut up", "quiet", "cancel",
    "listen", "silence", "enough", "halt", "cut", "shh", "buddy stop",
    "buddy wait", "stop it", "wait wait", "stop stop", "stay quiet", "never mind"
]

def recognition_worker(recognizer: sr.Recognizer, audio_queue: queue.Queue, state: dict):
    """Background worker that transcribes audio chunks concurrently without blocking mic capture."""
    while True:
        try:
            item = audio_queue.get()
            if item is None:
                break

            audio, capture_time, was_speaking = item

            # Discard stale interrupt chunks older than 3 seconds
            if was_speaking and (time.time() - capture_time > 3.0):
                audio_queue.task_done()
                continue

            try:
                text = recognizer.recognize_google(audio).strip().lower()
            except sr.UnknownValueError:
                audio_queue.task_done()
                continue
            except sr.RequestError as e:
                print(json.dumps({"type": "error", "message": f"STT error: {e}"}), flush=True)
                audio_queue.task_done()
                continue
            except Exception:
                audio_queue.task_done()
                continue

            if not text or len(text) < 2:
                audio_queue.task_done()
                continue

            now = time.time()
            is_interrupt = any(kw in text for kw in INTERRUPT_KEYWORDS)

            # If user spoke an interrupt word and Buddy was/is speaking, handle immediately
            if is_interrupt and (was_speaking or is_buddy_speaking()):
                # Flush remaining queue to avoid processing stale audio chunks
                while not audio_queue.empty():
                    try:
                        audio_queue.get_nowait()
                        audio_queue.task_done()
                    except (queue.Empty, ValueError):
                        break

                print(json.dumps({"type": "command", "text": text, "is_interrupt": True}), flush=True)
                audio_queue.task_done()
                continue

            is_wake = any(w in text for w in ["buddy", "ultron", "hey buddy", "hey ultron"])
            is_cmd = any(kw in text for kw in COMMAND_KEYWORDS)
            is_deactivate = any(w in text for w in ["stop listening", "go to sleep", "bye buddy", "bye ultron"])

            if is_deactivate:
                state["active_until"] = 0
                print(json.dumps({"type": "deactivate", "text": text}), flush=True)
            elif is_wake or is_cmd or now < state["active_until"]:
                state["active_until"] = now + 90
                print(json.dumps({"type": "command", "text": text}), flush=True)
            else:
                print(json.dumps({"type": "transcript", "text": text}), flush=True)

            audio_queue.task_done()
        except Exception as e:
            sys.stderr.write(f"[Worker Error] {e}\n")
            sys.stderr.flush()

def listen_continuously():
    recognizer = sr.Recognizer()
    recognizer.dynamic_energy_threshold = True

    sys.stderr.write("[STT] Initializing microphone...\n")
    sys.stderr.flush()

    audio_queue: queue.Queue = queue.Queue(maxsize=15)
    state = {"active_until": time.time() + 300}

    # Launch 3 concurrent recognition worker threads
    num_workers = 3
    threads = []
    for _ in range(num_workers):
        t = threading.Thread(
            target=recognition_worker,
            args=(recognizer, audio_queue, state),
            daemon=True
        )
        t.start()
        threads.append(t)

    with sr.Microphone() as source:
        sys.stderr.write("[STT] Calibrating for ambient noise...\n")
        sys.stderr.flush()
        recognizer.adjust_for_ambient_noise(source, duration=1.0)
        baseline_energy = max(recognizer.energy_threshold, 250)
        sys.stderr.write(f"[STT] Ready. Baseline energy threshold: {baseline_energy:.0f}\n")
        sys.stderr.flush()

        print(json.dumps({"status": "ready"}), flush=True)

        while True:
            try:
                speaking = is_buddy_speaking()
                if speaking:
                    # ULTRA-FAST INTERRUPT MODE:
                    # 0.9s chunk limit + 0.2s pause threshold for instantaneous interrupt detection
                    recognizer.dynamic_energy_threshold = False
                    recognizer.energy_threshold = baseline_energy
                    recognizer.pause_threshold = 0.2
                    recognizer.non_speaking_duration = 0.1
                    audio = recognizer.listen(source, phrase_time_limit=0.9, timeout=None)
                else:
                    # NORMAL COMMAND MODE:
                    # Generous timing for full natural questions
                    recognizer.dynamic_energy_threshold = True
                    recognizer.pause_threshold = 0.8
                    recognizer.non_speaking_duration = 0.4
                    audio = recognizer.listen(source, phrase_time_limit=10.0, timeout=None)

                # Push captured audio immediately into worker queue (non-blocking capture)
                try:
                    audio_queue.put_nowait((audio, time.time(), speaking))
                except queue.Full:
                    try:
                        audio_queue.get_nowait()
                        audio_queue.task_done()
                    except (queue.Empty, ValueError):
                        pass
                    audio_queue.put_nowait((audio, time.time(), speaking))

            except sr.WaitTimeoutError:
                pass
            except Exception as e:
                time.sleep(0.05)

if __name__ == "__main__":
    try:
        listen_continuously()
    except KeyboardInterrupt:
        sys.exit(0)

