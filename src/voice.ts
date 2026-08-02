import { spawn } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
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
let currentlySpeakingText = '';

const SPEAKING_FLAG = '/tmp/ultron_buddy_speaking';

function setSpeakingFlag(speaking: boolean): void {
  try {
    if (speaking) {
      writeFileSync(SPEAKING_FLAG, '1');
    } else if (existsSync(SPEAKING_FLAG)) {
      unlinkSync(SPEAKING_FLAG);
    }
  } catch {
    // Ignore fs cleanup errors
  }
}

// ─── Text cleaner for TTS ────────────────────────────────────────────────────
function cleanTextForSpeech(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, 'code snippet.')
    .replace(/<[^>]+>/g, '') // Strip email tags & XML like <noreply@...>
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/[-_]{3,}/g, '')
    .replace(/\|/g, ', ')
    .replace(/\bFrom:\s*/gi, '')
    .replace(/\bSubject:\s*/gi, '')
    .replace(/\bDate:\s*/gi, '')
    .replace(/\n+/g, '. ')
    .replace(/["']/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─── Acoustic Echo Filter ────────────────────────────────────────────────────
// Detects if audio picked up by mic is just Buddy's voice coming out of the speakers
function isSpeakerEcho(heardText: string): boolean {
  if (!currentlySpeakingText) return false;

  const heard = heardText.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const speaking = currentlySpeakingText.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

  if (!heard || !speaking) return false;

  // Never consider explicit stop keywords as echo
  if (/\b(stop|wait|pause|hold on|shut up|quiet|cancel|hush|silence|enough)\b/i.test(heard)) {
    return false;
  }

  // Direct substring match
  if (speaking.includes(heard)) {
    return true;
  }

  const heardWords = heard.split(/\s+/).filter((w) => w.length > 2);
  if (heardWords.length === 0) return true;

  // If heard text is short (1-2 words) and any word matches what Buddy is saying, treat as echo
  const matchingWords = heardWords.filter((w) => speaking.includes(w));
  if (heardWords.length <= 2 && matchingWords.length > 0) {
    return true;
  }

  return matchingWords.length / heardWords.length >= 0.5;
}

// ─── Stop any active TTS immediately ─────────────────────────────────────────
export function stopSpeaking(): void {
  isSpeaking = false;
  currentlySpeakingText = '';
  setSpeakingFlag(false);
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
      currentlySpeakingText = '';
      setSpeakingFlag(false);
      resolve();
      return;
    }

    isSpeaking = true;
    currentlySpeakingText = clean;
    setSpeakingFlag(true);

    console.log(`\n🎙️ [Buddy]: ${text}\n`);
    emitToDashboard('VOICE_BUDDY_SPEAKING', { text, cleanText: clean });
    emitToDashboard('VOICE_STATUS', { state: 'speaking', text: clean });

    const proc = spawn('say', [clean]);
    activeTtsProcess = proc;

    proc.on('close', () => {
      if (activeTtsProcess === proc) {
        activeTtsProcess = null;
        isSpeaking = false;
        currentlySpeakingText = '';
        setSpeakingFlag(false);
        emitToDashboard('VOICE_STATUS', { state: 'idle' });
      }
      resolve();
    });

    proc.on('error', (err) => {
      console.error('TTS error:', err.message);
      if (activeTtsProcess === proc) {
        activeTtsProcess = null;
        isSpeaking = false;
        currentlySpeakingText = '';
        setSpeakingFlag(false);
        emitToDashboard('VOICE_STATUS', { state: 'idle' });
      }
      resolve();
    });
  });
}

// ─── Handle a voice / text command from Boss ────────────────────────────────
async function handleCommand(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  // Pure stop / silence commands — stop immediately and stay quiet without querying LLM
  const isPureStop = /^\s*(stop|stop\s+stop|wait|hold\s+on|shut\s+up|quiet|pause|cancel|hush|silence|enough|never\s*mind)\s*$/i.test(trimmed);
  if (isPureStop) {
    console.log(`⚡ [Silence]: "${trimmed}" — staying quiet.`);
    stopSpeaking();
    return;
  }

  if (isProcessing) return;
  isProcessing = true;
  try {
    console.log(`\n🗣️ [Boss]: ${trimmed}`);
    emitToDashboard('VOICE_USER_SPEAKING', { text: trimmed });
    emitToDashboard('VOICE_STATUS', { state: 'thinking', text: trimmed });

    if (!assistant) assistant = new UltronAssistant();

    const response = await assistant.chat({
      message: trimmed,
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
      if (!trimmed) return; // Silent interrupt on Enter
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
          speak("Hey Boss, what's up?");

        } else if (payload.type === 'command' || payload.type === 'transcript') {
          const text = (payload.text ?? '').trim();
          if (!text) continue;

          // Check for any stop / interrupt command
          const isExplicitStop = /\b(stop|wait|pause|hold on|shut up|quiet|cancel|hush|silence|enough|buddy stop|buddy wait)\b/i.test(text);

          if (isSpeaking) {
            if (isExplicitStop) {
              console.log(`⚡ [Interrupt]: "${text}" — stopping speech immediately.`);
              stopSpeaking();
              continue; // Do NOT speak back, stay quiet and ready for next command
            }

            // Check if this is just Buddy's speaker echo heard by the microphone
            if (isSpeakerEcho(text)) {
              // Ignore speaker echo — let Buddy finish speaking
              continue;
            }

            // If heard text is more than 2 words and not echo, treat as real user barge-in
            const words = text.split(/\s+/).filter((w) => w.length > 2);
            if (words.length >= 2) {
              console.log(`⚡ [Barge-In]: "${text}" — switching to new command.`);
              stopSpeaking();
              handleCommand(text);
            }

          } else if (payload.type === 'command' && !isProcessing) {
            if (isExplicitStop) {
              console.log(`⚡ [Silence]: "${text}" — staying quiet.`);
              stopSpeaking();
              continue;
            }
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
