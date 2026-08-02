import { spawn, exec } from 'child_process';
import util from 'util';
import path from 'path';
import { UltronAssistant } from './agents/assistant';
import { initDatabase } from './database';
import { emitToDashboard } from './services/socket';

const execAsync = util.promisify(exec);
let assistant: UltronAssistant;
let isSpeaking = false;
let isProcessing = false;

function cleanTextForSpeech(rawText: string): string {
  return rawText
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

let activeTtsProcess: ReturnType<typeof spawn> | null = null;
let listenerProcess: ReturnType<typeof spawn> | null = null;

export function stopSpeaking() {
  if (activeTtsProcess) {
    try {
      activeTtsProcess.kill('SIGKILL');
    } catch {}
    activeTtsProcess = null;
  }
  try {
    exec('killall say 2>/dev/null || true');
  } catch {}
  isSpeaking = false;
  try {
    listenerProcess?.stdin?.write('SILENT\n');
  } catch {}
  emitToDashboard('VOICE_STATUS', { state: 'idle' });
}

// Simple TTS wrapper for macOS with instant interrupt support
export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    stopSpeaking();

    const clean = cleanTextForSpeech(text);
    if (!clean) {
      isSpeaking = false;
      return resolve();
    }

    isSpeaking = true;
    console.log(`\n🎙️ [Buddy]: ${text}\n`);

    emitToDashboard('VOICE_BUDDY_SPEAKING', { text, cleanText: clean });
    emitToDashboard('VOICE_STATUS', { state: 'speaking', text: clean });

    try {
      listenerProcess?.stdin?.write('SPEAKING\n');
    } catch {}

    activeTtsProcess = spawn('say', [clean]);

    activeTtsProcess.on('error', (err) => {
      console.error('Error playing audio:', err.message);
      isSpeaking = false;
      activeTtsProcess = null;
      try {
        listenerProcess?.stdin?.write('SILENT\n');
      } catch {}
      emitToDashboard('VOICE_STATUS', { state: 'idle' });
      resolve();
    });

    activeTtsProcess.on('close', () => {
      isSpeaking = false;
      activeTtsProcess = null;
      try {
        listenerProcess?.stdin?.write('SILENT\n');
      } catch {}
      emitToDashboard('VOICE_STATUS', { state: 'idle' });
      resolve();
    });
  });
}

async function handleCommand(text: string) {
  if (isProcessing) return; // Prevent overlapping requests
  isProcessing = true;

  try {
    console.log(`\n🗣️ [Boss]: ${text}`);
    emitToDashboard('VOICE_USER_SPEAKING', { text });
    emitToDashboard('VOICE_STATUS', { state: 'thinking', text });

    if (!assistant) {
      assistant = new UltronAssistant();
    }

    const response = await assistant.chat({
      message: text,
      conversationId: 'terminal-voice'
    });

    if (response && response.response) {
      await speak(response.response);
    }
  } catch (error) {
    console.error('Error processing command:', error);
    await speak("Boss, I am processing your request.");
  } finally {
    isProcessing = false;
  }
}

export function startVoiceDaemon() {
  console.log('🤖 Initializing Ultron Voice Engine...');
  
  const pythonExecutable = path.resolve(__dirname, '../.venv/bin/python');
  const listenerScript = path.resolve(__dirname, '../voice_listener.py');

  const child = spawn(pythonExecutable, [listenerScript]);
  listenerProcess = child;

  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter((l: string) => l.trim().length > 0);
    
    for (const line of lines) {
      try {
        const payload = JSON.parse(line);
        
        if (payload.status === 'ready') {
          console.log('✅ Voice Engine Ready. Listening for your voice...');
          emitToDashboard('VOICE_STATUS', { state: 'ready' });
          speak('Hi Boss. Ultron is online and listening. Just speak naturally.');
        } else if (payload.type === 'interrupt') {
          console.log(`⚡ [Interrupt]: Boss spoke ("${payload.text}")`);
          stopSpeaking();
          
          const isPureInterrupt = /^(wait|wait wait|stop|pause|hold on|listen|listen to me|shut up|hush|quiet|hey buddy)$/i.test(payload.text.trim());
          if (isPureInterrupt) {
            speak("Okay Boss, I'm listening. What do you need?");
          } else {
            handleCommand(payload.text);
          }
        } else if (payload.type === 'command') {
          if (isSpeaking) {
            const isInterrupt = /^(wait|wait wait|stop|pause|hold on|listen|shut up|quiet|hey buddy)/i.test(payload.text.trim());
            if (isInterrupt) {
              console.log(`⚡ [Interrupt]: Boss interrupted Buddy ("${payload.text}")`);
              stopSpeaking();
              const isPureInterrupt = /^(wait|wait wait|stop|pause|hold on|listen|listen to me|shut up|hush|quiet|hey buddy)$/i.test(payload.text.trim());
              if (isPureInterrupt) {
                speak("Okay Boss, I'm listening. What do you need?");
              } else {
                handleCommand(payload.text);
              }
            }
          } else if (!isProcessing) {
            handleCommand(payload.text);
          }
        } else if (payload.type === 'deactivate') {
          console.log(`😴 [Buddy]: Going quiet. Say "Buddy" or any command to wake me up.`);
          emitToDashboard('VOICE_STATUS', { state: 'sleeping' });
        } else if (payload.type === 'transcript') {
          emitToDashboard('VOICE_AMBIENT', { text: payload.text });
        } else if (payload.type === 'error') {
          console.error(`⚠️ [STT Warning]: ${payload.message}`);
        }
      } catch (e) {
        // Ignore non-json debug lines
      }
    }
  });

  child.stderr.on('data', (data) => {
    console.error(`[Python STT Error]: ${data}`);
  });

  child.on('close', (code) => {
    console.log(`Voice Engine exited with code ${code}. Restarting in 3 seconds...`);
    setTimeout(startVoiceDaemon, 3000);
  });
}

// Start the Daemon if run directly
if (require.main === module) {
  (async () => {
    try {
      await initDatabase();
      assistant = new UltronAssistant();
      startVoiceDaemon();
    } catch (error) {
      console.error('Failed to start Voice Engine:', error);
    }
  })();
}

