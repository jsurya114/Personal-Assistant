import { spawn } from 'child_process';
import path from 'path';
import { UltronAssistant } from './agents/assistant';
import { initDatabase } from './database';
import { emitToDashboard } from './services/socket';

// ─── State ────────────────────────────────────────────────────────────────────
let assistant: UltronAssistant;
let isSpeaking = false;       // true while any sentence is playing
let interrupted = false;      // set when Boss speaks during playback
let isProcessing = false;
let activeTtsProcess: ReturnType<typeof spawn> | null = null;
let listenerProcess: ReturnType<typeof spawn> | null = null;

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

// ─── Split text into small word-groups for near-instant interruptibility ──────
function splitIntoChunks(text: string): string[] {
  const WORDS_PER_CHUNK = 4; // speak 4 words at a time → interrupt latency < 1s
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += WORDS_PER_CHUNK) {
    chunks.push(words.slice(i, i + WORDS_PER_CHUNK).join(' '));
  }
  return chunks;
}

// ─── Speak a single chunk synchronously ──────────────────────────────────────
function speakChunk(chunk: string): Promise<void> {
  return new Promise((resolve) => {
    if (interrupted) { resolve(); return; }

    activeTtsProcess = spawn('say', [chunk]);

    activeTtsProcess.on('close', () => {
      activeTtsProcess = null;
      resolve();
    });

    activeTtsProcess.on('error', (err) => {
      console.error('TTS chunk error:', err.message);
      activeTtsProcess = null;
      resolve();
    });
  });
}

// ─── Stop any active TTS immediately ─────────────────────────────────────────
export function stopSpeaking(): void {
  interrupted = true;   // signal the sentence loop to abort
  if (activeTtsProcess) {
    try { activeTtsProcess.kill('SIGKILL'); } catch {}
    activeTtsProcess = null;
  }
  isSpeaking = false;
  emitToDashboard('VOICE_STATUS', { state: 'idle' });
}

// ─── Speak full response sentence by sentence ─────────────────────────────────
export async function speak(text: string): Promise<void> {
  // Stop any current speech
  stopSpeaking();

  const clean = cleanTextForSpeech(text);
  if (!clean) return;

  // Reset interrupt flag for this new response
  interrupted = false;
  isSpeaking = true;

  console.log(`\n🎙️ [Buddy]: ${text}\n`);
  emitToDashboard('VOICE_BUDDY_SPEAKING', { text, cleanText: clean });
  emitToDashboard('VOICE_STATUS', { state: 'speaking', text: clean });

  const chunks = splitIntoChunks(clean);

  for (const chunk of chunks) {
    if (interrupted) break;   // Boss interrupted — stop immediately
    await speakChunk(chunk);
  }

  // Only mark idle if we weren't interrupted in the middle
  if (!interrupted) {
    isSpeaking = false;
    emitToDashboard('VOICE_STATUS', { state: 'idle' });
  }
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
    stdio: ['ignore', 'pipe', 'pipe']
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
            // Boss said ANYTHING while Buddy is speaking → stop at next sentence boundary
            console.log(`⚡ [Interrupt]: "${text}" — stopping Buddy.`);
            stopSpeaking();
            // Small delay to let SIGKILL settle, then acknowledge
            setTimeout(() => speak("Go ahead Boss, I am listening."), 300);

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
