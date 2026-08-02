import speech_recognition as sr
import json
import sys
import time
import os
import audioop

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

# ─────────────────────────────────────────────────────────────────────────────
# INTERRUPT DETECTION — uses raw audio energy (RMS), NOT Google STT
# This fires in < 200ms with no API call needed.
# energy_threshold is calibrated at startup from ambient noise.
# ─────────────────────────────────────────────────────────────────────────────
ENERGY_MULTIPLIER    = 5.0   # Boss's voice must be 5x louder than ambient (filters speaker echo)
energy_threshold     = 1200  # default; overridden after calibration
interrupt_cooldown   = 0.0   # timestamp until which interrupts are suppressed

def measure_rms(audio_data: sr.AudioData) -> float:
    raw = audio_data.get_raw_data()
    if len(raw) < 2:
        return 0.0
    return audioop.rms(raw, 2)

def listen_continuously():
    global energy_threshold

    recognizer = sr.Recognizer()
    recognizer.dynamic_energy_threshold = False   # we manage threshold ourselves
    recognizer.pause_threshold    = 0.8
    recognizer.non_speaking_duration = 0.4

    # ── Calibrate ambient noise ────────────────────────────────────────────
    sys.stderr.write("[STT] Calibrating microphone...\n")
    sys.stderr.flush()
    with sr.Microphone() as source:
        recognizer.adjust_for_ambient_noise(source, duration=1.5)
        energy_threshold = recognizer.energy_threshold * ENERGY_MULTIPLIER
    # Clamp: never let threshold be so low that speaker echo triggers it
    energy_threshold = max(energy_threshold, 900)
    sys.stderr.write(f"[STT] Energy threshold set to {energy_threshold:.0f}\n")
    sys.stderr.flush()

    print(json.dumps({"status": "ready"}), flush=True)

    # Start ACTIVE immediately for 3 minutes
    active_until = time.time() + 180

    # Buffer for assembling multi-chunk commands while Buddy is silent
    buffer: list[str] = []
    last_chunk_at: float = 0.0
    FLUSH_TIMEOUT = 1.5   # seconds of silence → flush buffer as full command

    while True:
        now = time.time()

        # ── Flush buffer if silence elapsed ───────────────────────────────
        if buffer and (now - last_chunk_at) >= FLUSH_TIMEOUT:
            full_text = ' '.join(buffer).strip()
            buffer = []
            last_chunk_at = 0.0

            if full_text and not is_buddy_speaking():
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

        # ── Capture a short audio chunk ───────────────────────────────────
        try:
            with sr.Microphone() as source:
                # Short 1.5s window so we loop fast and check flags often
                audio = recognizer.listen(source, phrase_time_limit=1.5, timeout=None)

            now = time.time()
            rms = measure_rms(audio)

            if is_buddy_speaking():
                # ── INTERRUPT MODE ─────────────────────────────────────────
                # Check raw audio energy — NO STT API call.
                # If RMS exceeds threshold AND we are not in cooldown, interrupt.
                if rms > energy_threshold and now > interrupt_cooldown:
                    interrupt_cooldown = now + 3.0   # suppress for 3s to avoid looping
                    sys.stderr.write(f"[INTERRUPT] RMS={rms:.0f} > threshold={energy_threshold:.0f}\n")
                    sys.stderr.flush()
                    print(json.dumps({"type": "command", "text": "interrupt"}), flush=True)
                    buffer = []
                    last_chunk_at = 0.0
                # Ignore low-energy sounds (background noise / speaker echo)

            else:
                # ── NORMAL COMMAND MODE ────────────────────────────────────
                # Only send to STT if the energy suggests real speech
                if rms > (energy_threshold / ENERGY_MULTIPLIER):
                    try:
                        text = recognizer.recognize_google(audio).strip().lower()
                        if text and len(text) >= 2:
                            buffer.append(text)
                            last_chunk_at = now
                    except sr.UnknownValueError:
                        pass
                    except sr.RequestError as e:
                        print(json.dumps({"type": "error", "message": f"STT error: {e}"}), flush=True)

        except sr.UnknownValueError:
            pass
        except Exception:
            pass

if __name__ == "__main__":
    try:
        listen_continuously()
    except KeyboardInterrupt:
        sys.exit(0)
