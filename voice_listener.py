import speech_recognition as sr
import json
import sys
import time
import os

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

# Flag file written by Node.js to signal Buddy is speaking
SPEAKING_FLAG = '/tmp/ultron_buddy_speaking'

def is_buddy_speaking() -> bool:
    return os.path.exists(SPEAKING_FLAG)

# ─── Chunk-buffering command assembler ────────────────────────────────────────
# Strategy:
#   - Always use short phrase_time_limit=2s → listen loop never blocks long
#   - When Buddy is NOT speaking: buffer incoming chunks; flush as one command
#     after FLUSH_TIMEOUT seconds of silence between chunks
#   - When Buddy IS speaking: any incoming speech = immediate interrupt signal
# ──────────────────────────────────────────────────────────────────────────────
FLUSH_TIMEOUT = 1.2    # seconds of silence between chunks before flushing buffer
PHRASE_LIMIT  = 2.5    # max seconds per chunk — short so loop stays responsive

def listen_continuously():
    recognizer = sr.Recognizer()
    recognizer.dynamic_energy_threshold = True
    recognizer.pause_threshold    = 0.6   # silence inside a chunk to mark end
    recognizer.non_speaking_duration = 0.3

    # Calibrate for ambient noise once
    with sr.Microphone() as source:
        recognizer.adjust_for_ambient_noise(source, duration=0.8)

    print(json.dumps({"status": "ready"}), flush=True)

    # Start ACTIVE immediately for 3 minutes
    active_until = time.time() + 180

    # Buffer for assembling multi-chunk commands
    buffer: list[str] = []
    last_chunk_at: float = 0.0

    while True:
        # ── Flush buffer if enough silence has passed ──────────────────────
        now = time.time()
        if buffer and (now - last_chunk_at) >= FLUSH_TIMEOUT:
            full_text = ' '.join(buffer).strip()
            buffer = []
            last_chunk_at = 0.0

            if full_text:
                is_wake = any(w in full_text for w in ["buddy", "ultron", "hey buddy", "hey ultron"])
                is_command_phrase = any(kw in full_text for kw in COMMAND_KEYWORDS)

                if any(w in full_text for w in ["stop listening", "go to sleep", "bye buddy", "bye ultron"]):
                    active_until = 0
                    print(json.dumps({"type": "deactivate", "text": full_text}), flush=True)
                elif is_wake or now < active_until or is_command_phrase:
                    active_until = now + 60
                    print(json.dumps({"type": "command", "text": full_text}), flush=True)
                else:
                    print(json.dumps({"type": "transcript", "text": full_text}), flush=True)

        # ── Listen for next short audio chunk ──────────────────────────────
        try:
            with sr.Microphone() as source:
                audio = recognizer.listen(source, phrase_time_limit=PHRASE_LIMIT, timeout=None)

            text = recognizer.recognize_google(audio).strip().lower()
            if not text or len(text) < 2:
                continue

            now = time.time()

            if is_buddy_speaking():
                # ── INTERRUPT MODE: Buddy is speaking ──────────────────────
                # Any speech from Boss = immediate interrupt — no buffering
                print(json.dumps({"type": "command", "text": text}), flush=True)
                # Clear buffer so leftover chunks don't replay after interrupt
                buffer = []
                last_chunk_at = 0.0
            else:
                # ── NORMAL MODE: Add chunk to buffer ──────────────────────
                buffer.append(text)
                last_chunk_at = now

        except sr.UnknownValueError:
            pass   # silence or unrecognized audio
        except sr.RequestError as e:
            print(json.dumps({"type": "error", "message": f"Speech API error: {e}"}), flush=True)
        except Exception:
            pass

if __name__ == "__main__":
    try:
        listen_continuously()
    except KeyboardInterrupt:
        sys.exit(0)
