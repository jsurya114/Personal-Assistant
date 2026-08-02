import speech_recognition as sr
import json
import sys
import time

# Command keywords — if speech contains ANY of these, treat as a command
# even without wake word. Boss is talking to Ultron, not random chatter.
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

INTERRUPT_KEYWORDS = [
    "wait", "wait wait", "stop", "pause", "hold on", "hold on buddy",
    "listen", "listen to me", "hush", "shut up", "cut it", "hang on",
]

def listen_continuously():
    recognizer = sr.Recognizer()
    recognizer.dynamic_energy_threshold = True
    recognizer.pause_threshold = 0.5
    recognizer.non_speaking_duration = 0.3

    # Adjust for ambient noise
    with sr.Microphone() as source:
        recognizer.adjust_for_ambient_noise(source, duration=0.6)

    print(json.dumps({"status": "ready"}), flush=True)

    # Start ACTIVE immediately — Boss launched voice mode, so he wants to talk
    active_until = time.time() + 180  # 3 minutes of active listening on startup

    while True:
        try:
            with sr.Microphone() as source:
                audio = recognizer.listen(source, phrase_time_limit=12, timeout=None)

            text = recognizer.recognize_google(audio).strip().lower()
            if not text or len(text) < 2:
                continue

            now = time.time()

            # Immediate Interrupt Check (Barge-In)
            is_interrupt = any(kw in text for kw in INTERRUPT_KEYWORDS)
            if is_interrupt:
                active_until = now + 60
                print(json.dumps({"type": "interrupt", "text": text}), flush=True)
                continue

            # Wake words — explicit activation
            is_wake = any(w in text for w in ["buddy", "ultron", "hey buddy", "hey ultron"])

            # Command keywords — implicit activation (Boss is clearly talking to Ultron)
            is_command_phrase = any(kw in text for kw in COMMAND_KEYWORDS)

            if is_wake:
                # Explicit wake: extend conversation window to 60 seconds
                active_until = now + 60
                print(json.dumps({"type": "command", "text": text}), flush=True)

            elif now < active_until:
                # Inside active conversation window
                if any(w in text for w in ["stop listening", "go to sleep", "bye buddy", "bye ultron"]):
                    active_until = 0
                    print(json.dumps({"type": "deactivate", "text": text}), flush=True)
                else:
                    active_until = now + 60  # Keep extending
                    print(json.dumps({"type": "command", "text": text}), flush=True)

            elif is_command_phrase:
                # No wake word, but it sounds like a command → activate and process
                active_until = now + 60
                print(json.dumps({"type": "command", "text": text}), flush=True)

            else:
                # Truly ambient / unrelated speech
                print(json.dumps({"type": "transcript", "text": text}), flush=True)

        except sr.UnknownValueError:
            pass  # Silence or unrecognized
        except sr.RequestError as e:
            print(json.dumps({"type": "error", "message": f"Speech API error: {e}"}), flush=True)
        except Exception:
            pass

if __name__ == "__main__":
    try:
        listen_continuously()
    except KeyboardInterrupt:
        sys.exit(0)
