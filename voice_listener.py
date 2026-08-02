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

def listen_continuously():
    recognizer = sr.Recognizer()
    recognizer.dynamic_energy_threshold = True
    recognizer.pause_threshold = 0.4
    recognizer.non_speaking_duration = 0.2

    # Adjust for ambient noise once at startup
    with sr.Microphone() as source:
        recognizer.adjust_for_ambient_noise(source, duration=0.5)

    print(json.dumps({"status": "ready"}), flush=True)

    # Start ACTIVE immediately for 3 minutes
    active_until = time.time() + 180

    while True:
        try:
            with sr.Microphone() as source:
                # Use very short phrase_time_limit so every word is captured quickly
                audio = recognizer.listen(source, phrase_time_limit=3, timeout=None)

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
