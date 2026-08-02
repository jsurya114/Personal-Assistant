import speech_recognition as sr
import json
import sys
import time
import re
import threading

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

# Strict user interrupt words (only spoken when Boss wants to cut Buddy off)
INTERRUPT_PATTERNS = [
    r"\bwait\b", r"\bwait wait\b", r"\bstop\b", r"\bpause\b",
    r"\bhold on\b", r"\bshut up\b", r"\bstop talking\b",
    r"\bbe quiet\b", r"\bhush\b",
]

buddy_is_speaking = False

def stdin_listener():
    global buddy_is_speaking
    for line in sys.stdin:
        cmd = line.strip()
        if cmd == "SPEAKING":
            buddy_is_speaking = True
        elif cmd == "SILENT":
            buddy_is_speaking = False

# Run background thread to receive speaking state from Node.js
threading.Thread(target=stdin_listener, daemon=True).start()

def is_strict_interrupt(text: str) -> bool:
    for pattern in INTERRUPT_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return True
    return False

def listen_continuously():
    global buddy_is_speaking
    recognizer = sr.Recognizer()
    recognizer.dynamic_energy_threshold = True
    recognizer.pause_threshold = 0.5
    recognizer.non_speaking_duration = 0.3

    # Adjust for ambient noise
    with sr.Microphone() as source:
        recognizer.adjust_for_ambient_noise(source, duration=0.6)

    print(json.dumps({"status": "ready"}), flush=True)

    # Start ACTIVE immediately
    active_until = time.time() + 180

    while True:
        try:
            with sr.Microphone() as source:
                audio = recognizer.listen(source, phrase_time_limit=12, timeout=None)

            text = recognizer.recognize_google(audio).strip().lower()
            if not text or len(text) < 2:
                continue

            now = time.time()

            # If Buddy is currently speaking through the speakers:
            if buddy_is_speaking:
                # ONLY trigger if Boss explicitly tells Buddy to stop / wait
                if is_strict_interrupt(text):
                    active_until = now + 60
                    print(json.dumps({"type": "interrupt", "text": text}), flush=True)
                # Ignore self-echo and background chatter
                continue

            # If Buddy is NOT speaking (normal user input):
            if is_strict_interrupt(text):
                active_until = now + 60
                print(json.dumps({"type": "interrupt", "text": text}), flush=True)
                continue

            # Wake words — explicit activation
            is_wake = any(w in text for w in ["buddy", "ultron", "hey buddy", "hey ultron"])

            # Command keywords — implicit activation
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
