import speech_recognition as sr
import json
import sys
import time
import os

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
    "stop", "wait", "hold on", "pause", "shut up", "quiet", "cancel", "listen", "silence", "enough"
]

def listen_continuously():
    recognizer = sr.Recognizer()
    recognizer.dynamic_energy_threshold = True

    sys.stderr.write("[STT] Initializing microphone...\n")
    sys.stderr.flush()

    with sr.Microphone() as source:
        sys.stderr.write("[STT] Calibrating for ambient noise...\n")
        sys.stderr.flush()
        recognizer.adjust_for_ambient_noise(source, duration=1.0)
        baseline_energy = max(recognizer.energy_threshold, 250)
        sys.stderr.write(f"[STT] Ready. Baseline energy threshold: {baseline_energy:.0f}\n")
        sys.stderr.flush()

        print(json.dumps({"status": "ready"}), flush=True)

        # Active conversation window (300 seconds of continuous natural dialogue)
        active_until = time.time() + 300

        while True:
            try:
                if is_buddy_speaking():
                    # INTERRUPT MODE: Fast & sensitive to catch even a single "stop" or "hold on"
                    recognizer.dynamic_energy_threshold = False
                    recognizer.energy_threshold = baseline_energy
                    recognizer.pause_threshold = 0.3
                    recognizer.non_speaking_duration = 0.15
                    audio = recognizer.listen(source, phrase_time_limit=2.0, timeout=None)
                else:
                    # NORMAL COMMAND MODE: Generous timing for full sentences like "check my latest mail"
                    recognizer.dynamic_energy_threshold = True
                    recognizer.pause_threshold = 0.9
                    recognizer.non_speaking_duration = 0.5
                    audio = recognizer.listen(source, phrase_time_limit=12.0, timeout=None)

                text = recognizer.recognize_google(audio).strip().lower()
                if not text or len(text) < 2:
                    continue

                now = time.time()
                is_wake = any(w in text for w in ["buddy", "ultron", "hey buddy", "hey ultron"])
                is_cmd = any(kw in text for kw in COMMAND_KEYWORDS)
                is_deactivate = any(w in text for w in ["stop listening", "go to sleep", "bye buddy", "bye ultron"])

                if is_deactivate:
                    active_until = 0
                    print(json.dumps({"type": "deactivate", "text": text}), flush=True)
                elif is_wake or is_cmd or now < active_until:
                    active_until = now + 90
                    print(json.dumps({"type": "command", "text": text}), flush=True)
                else:
                    print(json.dumps({"type": "transcript", "text": text}), flush=True)

            except sr.UnknownValueError:
                pass
            except sr.RequestError as e:
                print(json.dumps({"type": "error", "message": f"STT error: {e}"}), flush=True)
            except Exception as e:
                time.sleep(0.05)

if __name__ == "__main__":
    try:
        listen_continuously()
    except KeyboardInterrupt:
        sys.exit(0)
