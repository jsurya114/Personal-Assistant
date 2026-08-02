import { spawn, exec } from 'child_process';
import path from 'path';
import { UltronAssistant } from './agents/assistant';
import { initDatabase } from './database';
import { emitToDashboard } from './services/socket';

// ─── State ────────────────────────────────────────────────────────────────────
let assistant: UltronAssistant;
let isSpeaking = false;
let isProcessing = false;
let activeTtsProcess: ReturnType<typeof spawn> | null = null;

// ─── Text cleaner ─────────────────────────────────────────────────────────────
function cleanTextForSpeech(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, 'code snippet.')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/[-_]{3,}/g, '')
    .replace(/\n+/g, '. ')
    .replace(/"/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─── Interrupt detection (runs in Node — no Python IPC needed) ────────────────
const INTERRUPT_RE = /\b(wait|stop|pause|hold on|shut up|stop talking|be quiet|hush|cancel)\b/i;

function isInterruptPhrase(text: string): boolean {
  return INTERRUPT_RE.test(text);
}

// ─── Stop current speech immediately ─────────────────────────────────────────
export function stopSpeaking(): void {
  if (activeTtsProcess) {
    try { activeTtsProcess.kill('SIGKILL'); } catch {}
    activeTtsProcess = null;
  }
  isSpeaking = false;
  emitToDashboard('VOICE_STATUS', { state: 'idle' });
}

// ─── Speak via macOS native TTS ───────────────────────────────────────────────
export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    // Kill any current speech before starting new one
    if (activeTtsProcess) {
      try { activeTtsProcess.kill('SIGKILL'); } catch {}
      activeTtsProcess = null;
    }

    const clean = cleanTextForSpeech(text);
    if (!clean) { resolve(); return; }

    isSpeaking = true;
    console.log(`\n🎙️ [Buddy]: ${text}\n`);

    emitToDashboard('VOICE_BUDDY_SPEAKING', { text, cleanText: clean });
    emitToDashboard('VOICE_STATUS', { state: 'speaking', text: clean });

    activeTtsProcess = spawn('say', [clean]);

    const done = () => {
      isSpeaking = false;
      activeTtsProcess = null;
      emitToDashboard('VOICE_STATUS', { state: 'idle' });
      resolve();
    };

    activeTtsProcess.on('close', done);
    activeTtsProcess.on('error', (err) => {
      console.error('TTS error:', err.message);
      done();
    });
  });
}

// ─── Handle a voice command from Boss ────────────────────────────────────────
async function handleCommand(text: string): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;
  try {
    console.log(`\n🗣️ [Boss]: ${text}`);
    emitToDashboard('VOICE_USER_SPEAKING', { text });
    emitToDashboard('VOICE_STATUS', { state: 'thinking', text });

    if (!assistant) assistant = new UltronAssistant();

    const response = await assistant.chat({
      message: text,
      conversationId: 'terminal-voice'
    });

    if (response?.response) {
      await speak(response.response);
    }
  } catch (err) {
    console.error('Error processing command:', err);
    await speak("Boss, I hit a snag. Try again.");
  } finally {
    isProcessing = false;
  }
}

// ─── Voice Daemon ─────────────────────────────────────────────────────────────
export function startVoiceDaemon(): void {
  console.log('🤖 Initializing Ultron Voice Engine...');

  const pythonExecutable = path.resolve(__dirname, '../.venv/bin/python');
  const listenerScript = path.resolve(__dirname, '../voice_listener.py');

  const child = spawn(pythonExecutable, [listenerScript], {
    stdio: ['ignore', 'pipe', 'pipe']   // stdin=ignore, stdout/stderr piped
  });

  child.stdout.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(l => l.trim().length > 0);

    for (const line of lines) {
      try {
        const payload: { status?: string; type?: string; text?: string; message?: string } = JSON.parse(line);

        if (payload.status === 'ready') {
          console.log('✅ Voice Engine Ready. Listening for your voice...');
          emitToDashboard('VOICE_STATUS', { state: 'ready' });
          speak('Hi Boss. Ultron is online and listening. Just speak naturally.');

        } else if (payload.type === 'command' || payload.type === 'transcript') {
          const text = payload.text ?? '';

          if (isSpeaking) {
            // Any speech while Buddy is talking = treat as interrupt.
            // Only act on it if it's an explicit interrupt OR a real command.
            if (isInterruptPhrase(text)) {
              console.log(`⚡ [Interrupt]: "${text}" — stopping speech.`);
              stopSpeaking();
              speak("Okay Boss, I'm listening.");
            } else if (payload.type === 'command') {
              // Boss is asking something new while Buddy speaks → stop and handle
              console.log(`⚡ [Barge-in]: "${text}" — redirecting.`);
              stopSpeaking();
              handleCommand(text);
            }
            // Ignore transcripts while Buddy speaks (echo)

          } else if (payload.type === 'command' && !isProcessing) {
            handleCommand(text);
          }

        } else if (payload.type === 'deactivate') {
          console.log(`😴 [Buddy]: Going quiet. Say any command to wake me.`);
          emitToDashboard('VOICE_STATUS', { state: 'sleeping' });

        } else if (payload.type === 'error') {
          console.error(`⚠️ [STT]: ${payload.message}`);
        }

      } catch {
        // Non-JSON debug line — ignore
      }
    }
  });

  child.stderr.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[Python STT]: ${msg}`);
  });

  child.on('close', (code) => {
    console.log(`Voice Engine exited (code ${code}). Restarting in 3s...`);
    listenerProcess = null;
    setTimeout(startVoiceDaemon, 3000);
  });

  listenerProcess = child;
}

let listenerProcess: ReturnType<typeof spawn> | null = null;

// ─── Entry point ─────────────────────────────────────────────────────────────
if (require.main === module) {
  (async () => {
    try {
      await initDatabase();
      assistant = new UltronAssistant();
      startVoiceDaemon();
    } catch (err) {
      console.error('Failed to start Voice Engine:', err);
    }
  })();
}
