import speech_recognition as sr
import json
import sys
import time
import re

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

# Shared speaking state — written by Node's stdout replies via env trick.
# Since we removed stdin IPC, Node cannot signal us. Instead we track
# whether we've recently heard our own TTS output by checking a flag
# passed via a simple file-based semaphore.
buddy_speaking_flag = '/tmp/ultron_buddy_speaking'

import os

def is_buddy_speaking() -> bool:
    return os.path.exists(buddy_speaking_flag)

def listen_continuously():
    recognizer = sr.Recognizer()
    recognizer.dynamic_energy_threshold = True

    # ── Normal mode (Boss speaking): generous pause so full phrase captured ──
    # pause_threshold: seconds of silence after speech ends = end of phrase
    # non_speaking_duration: how long silence must persist before stop
    NORMAL_PAUSE     = 1.0   # wait 1s of silence after Boss stops talking
    NORMAL_NON_SPEAK = 0.5   # 0.5s non-speaking to close phrase
    NORMAL_PHRASE    = 15    # allow up to 15 seconds per command

    # ── Interrupt mode (Buddy speaking): fast, short chunks ──
    INTERRUPT_PAUSE     = 0.3
    INTERRUPT_NON_SPEAK = 0.2
    INTERRUPT_PHRASE    = 3    # capture quickly so interrupt fires fast

    recognizer.pause_threshold    = NORMAL_PAUSE
    recognizer.non_speaking_duration = NORMAL_NON_SPEAK

    # Adjust for ambient noise once at startup
    with sr.Microphone() as source:
        recognizer.adjust_for_ambient_noise(source, duration=0.8)

    print(json.dumps({"status": "ready"}), flush=True)

    # Start ACTIVE immediately for 3 minutes
    active_until = time.time() + 180

    while True:
        try:
            speaking = is_buddy_speaking()

            # Adjust recognizer thresholds based on whether Buddy is speaking
            if speaking:
                recognizer.pause_threshold       = INTERRUPT_PAUSE
                recognizer.non_speaking_duration = INTERRUPT_NON_SPEAK
                phrase_limit = INTERRUPT_PHRASE
            else:
                recognizer.pause_threshold       = NORMAL_PAUSE
                recognizer.non_speaking_duration = NORMAL_NON_SPEAK
                phrase_limit = NORMAL_PHRASE

            with sr.Microphone() as source:
                audio = recognizer.listen(source, phrase_time_limit=phrase_limit, timeout=None)

            text = recognizer.recognize_google(audio).strip().lower()
            if not text or len(text) < 2:
                continue

            now = time.time()

            # Always emit every recognized phrase with its raw text.
            # Node.js will decide what to do based on its isSpeaking state.
            is_wake = any(w in text for w in ["buddy", "ultron", "hey buddy", "hey ultron"])
            is_command_phrase = any(kw in text for kw in COMMAND_KEYWORDS)

            if is_wake:
                active_until = now + 60
                print(json.dumps({"type": "command", "text": text}), flush=True)

            elif now < active_until:
                if any(w in text for w in ["stop listening", "go to sleep", "bye buddy", "bye ultron"]):
                    active_until = 0
                    print(json.dumps({"type": "deactivate", "text": text}), flush=True)
                else:
                    active_until = now + 60
                    print(json.dumps({"type": "command", "text": text}), flush=True)

            elif is_command_phrase:
                active_until = now + 60
                print(json.dumps({"type": "command", "text": text}), flush=True)

            else:
                # Still emit as transcript — Node may ignore or log it
                print(json.dumps({"type": "transcript", "text": text}), flush=True)

        except sr.UnknownValueError:
            pass
        except sr.RequestError as e:
            print(json.dumps({"type": "error", "message": f"Speech API error: {e}"}), flush=True)
        except Exception:
            pass

if __name__ == "__main__":
    try:
        listen_continuously()
    except KeyboardInterrupt:
        sys.exit(0)
