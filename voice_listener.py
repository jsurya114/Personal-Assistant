import speech_recognition as sr
import json
import sys
import time
import os

# Flag file written by Node.js to signal Buddy is speaking
SPEAKING_FLAG = '/tmp/ultron_buddy_speaking'

# Command keywords — implicit activation when Boss speaks
COMMAND_KEYWORDS = [
    "search", "find", "list", "show", "get", "open", "check",
    "jobs", "job", "linkedin", "indeed", "resume", "apply",
    "weather", "news", "briefing", "status", "health",
    "remember", "recall", "save", "forget",
    "help", "what", "how", "when", "where", "who", "why",
    "please", "can you", "could you", "tell me", "give me",
    "dashboard", "browser", "email", "mail",
    "good morning", "good night", "hello", "hi",
]

def is_buddy_speaking() -> bool:
    return os.path.exists(SPEAKING_FLAG)

def listen_continuously():
    recognizer = sr.Recognizer()
    recognizer.dynamic_energy_threshold = True
    recognizer.pause_threshold    = 0.8
    recognizer.non_speaking_duration = 0.4

    # Calibrate once at startup
    sys.stderr.write("[STT] Calibrating microphone...\n")
    sys.stderr.flush()
    with sr.Microphone() as source:
        recognizer.adjust_for_ambient_noise(source, duration=1.0)
    sys.stderr.write(f"[STT] Ready. Ambient energy={recognizer.energy_threshold:.0f}\n")
    sys.stderr.flush()

    print(json.dumps({"status": "ready"}), flush=True)

    # Start ACTIVE immediately for 3 minutes
    active_until  = time.time() + 180
    interrupt_cooldown = 0.0   # suppress repeated interrupts

    # Buffer for assembling full commands when Buddy is silent
    buffer: list[str] = []
    last_chunk_at: float = 0.0
    FLUSH_TIMEOUT = 1.5  # seconds of silence → flush as one command

    while True:
        now = time.time()

        # ── Flush buffer if Boss paused long enough ───────────────────────
        if buffer and (now - last_chunk_at) >= FLUSH_TIMEOUT:
            full_text = ' '.join(buffer).strip()
            buffer = []
            last_chunk_at = 0.0

            if full_text:
                is_wake = any(w in full_text for w in ["buddy", "ultron", "hey buddy", "hey ultron"])
                is_cmd  = any(kw in full_text for kw in COMMAND_KEYWORDS)

                if any(w in full_text for w in ["stop listening", "go to sleep", "bye buddy", "bye ultron"]):
                    active_until = 0
                    print(json.dumps({"type": "deactivate", "text": full_text}), flush=True)
                elif is_wake or now < active_until or is_cmd:
                    active_until = now + 60
                    print(json.dumps({"type": "command", "text": full_text}), flush=True)
                else:
                    print(json.dumps({"type": "transcript", "text": full_text}), flush=True)

        # ── Listen for audio ──────────────────────────────────────────────
        speaking = is_buddy_speaking()

        try:
            with sr.Microphone() as source:
                if speaking:
                    # INTERRUPT MODE:
                    # timeout=0.5 → if no speech starts in 0.5s, raise WaitTimeoutError and loop again
                    # phrase_time_limit=1.5 → capture at most 1.5s of speech
                    # This way we NEVER block for more than 2s total — critical for fast interrupts
                    recognizer.pause_threshold    = 0.3
                    recognizer.non_speaking_duration = 0.2
                    audio = recognizer.listen(source, timeout=0.5, phrase_time_limit=1.5)
                else:
                    # NORMAL MODE: no timeout (wait until Boss starts talking), 2.5s max chunk
                    recognizer.pause_threshold    = 0.8
                    recognizer.non_speaking_duration = 0.4
                    audio = recognizer.listen(source, timeout=None, phrase_time_limit=2.5)

        except sr.WaitTimeoutError:
            # No speech started in 0.5s → loop again quickly (interrupt mode fast-cycle)
            continue
        except Exception:
            continue

        # ── Transcribe ────────────────────────────────────────────────────
        try:
            text = recognizer.recognize_google(audio).strip().lower()
        except sr.UnknownValueError:
            continue   # nothing recognized — good, probably just echo
        except sr.RequestError as e:
            print(json.dumps({"type": "error", "message": f"STT error: {e}"}), flush=True)
            continue

        if not text or len(text) < 2:
            continue

        now = time.time()

        if speaking:
            # ── INTERRUPT: any recognized text while Buddy speaks ─────────
            if now > interrupt_cooldown:
                sys.stderr.write(f"[INTERRUPT] Boss said: \"{text}\"\n")
                sys.stderr.flush()
                interrupt_cooldown = now + 2.5  # 2.5s cooldown to stop echo loops
                print(json.dumps({"type": "command", "text": text}), flush=True)
                buffer = []
                last_chunk_at = 0.0
        else:
            # ── NORMAL: buffer chunk for full command assembly ────────────
            buffer.append(text)
            last_chunk_at = now

if __name__ == "__main__":
    try:
        listen_continuously()
    except KeyboardInterrupt:
        sys.exit(0)
