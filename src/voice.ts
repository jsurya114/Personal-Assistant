import { spawn } from 'child_process';
import path from 'path';
import readline from 'readline';
import { UltronAssistant } from './agents/assistant';
import { initDatabase } from './database';
import { emitToDashboard } from './services/socket';

// ─── State ────────────────────────────────────────────────────────────────────
let assistant: UltronAssistant;
let isSpeaking = false;
let isProcessing = false;
let activeTtsProcess: ReturnType<typeof spawn> | null = null;
let listenerProcess: ReturnType<typeof spawn> | null = null;

// ─── Text cleaner for TTS ────────────────────────────────────────────────────
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

// ─── Stop any active TTS immediately ─────────────────────────────────────────
export function stopSpeaking(): void {
  isSpeaking = false;
  if (activeTtsProcess) {
    try {
      activeTtsProcess.kill('SIGKILL');
    } catch {
      // Process already terminated
    }
    activeTtsProcess = null;
  }
  emitToDashboard('VOICE_STATUS', { state: 'idle' });
}

// ─── Speak text naturally and smoothly ───────────────────────────────────────
export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    // Terminate any previous active process directly
    if (activeTtsProcess) {
      try {
        activeTtsProcess.kill('SIGKILL');
      } catch {
        // Already dead
      }
      activeTtsProcess = null;
    }

    const clean = cleanTextForSpeech(text);
    if (!clean) {
      isSpeaking = false;
      resolve();
      return;
    }

    isSpeaking = true;
    console.log(`\n🎙️ [Buddy]: ${text}\n`);
    emitToDashboard('VOICE_BUDDY_SPEAKING', { text, cleanText: clean });
    emitToDashboard('VOICE_STATUS', { state: 'speaking', text: clean });

    const proc = spawn('say', [clean]);
    activeTtsProcess = proc;

    proc.on('close', () => {
      if (activeTtsProcess === proc) {
        activeTtsProcess = null;
        isSpeaking = false;
        emitToDashboard('VOICE_STATUS', { state: 'idle' });
      }
      resolve();
    });

    proc.on('error', (err) => {
      console.error('TTS error:', err.message);
      if (activeTtsProcess === proc) {
        activeTtsProcess = null;
        isSpeaking = false;
        emitToDashboard('VOICE_STATUS', { state: 'idle' });
      }
      resolve();
    });
  });
}

// ─── Handle a voice / text command from Boss ────────────────────────────────
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

// ─── Keyboard Barge-In / Terminal Input ─────────────────────────────────────
function setupTerminalInput(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (isSpeaking) {
      console.log('⚡ [Interrupt via Terminal]');
      stopSpeaking();
      if (!trimmed) {
        speak('Go ahead Boss, I am listening.');
        return;
      }
    }
    if (trimmed) {
      handleCommand(trimmed);
    }
  });
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
    const lines = data.toString().split('\n').filter((l) => l.trim().length > 0);

    for (const line of lines) {
      try {
        const payload: { status?: string; type?: string; text?: string; message?: string } = JSON.parse(line);

        if (payload.status === 'ready') {
          console.log('✅ Voice Engine Ready. Listening for your voice...');
          console.log('💡 Tip: Speak naturally or press Enter in terminal to interrupt at any time.\n');
          emitToDashboard('VOICE_STATUS', { state: 'ready' });
          speak('Hi Boss. Ultron is online and listening. Just speak naturally.');

        } else if (payload.type === 'command' || payload.type === 'transcript') {
          const text = (payload.text ?? '').trim();
          if (!text) continue;

          if (isSpeaking) {
            console.log(`⚡ [Interrupt]: "${text}" — stopping Buddy.`);
            stopSpeaking();

            const isPureInterrupt = /^(stop|wait|pause|hold on|shut up|quiet|cancel|buddy|hey buddy)$/i.test(text);
            if (isPureInterrupt) {
              speak('Go ahead Boss, I am listening.');
            } else {
              handleCommand(text);
            }
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
  setupTerminalInput();
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
