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

export function stopSpeaking() {
  try {
    exec('killall say 2>/dev/null || true');
  } catch {}
  isSpeaking = false;
  emitToDashboard('VOICE_STATUS', { state: 'idle' });
}

// Simple TTS wrapper for macOS
export async function speak(text: string): Promise<void> {
  isSpeaking = true;
  console.log(`\n🎙️ [Buddy]: ${text}\n`);
  
  const clean = cleanTextForSpeech(text);
  if (!clean) {
    isSpeaking = false;
    return;
  }

  emitToDashboard('VOICE_BUDDY_SPEAKING', { text, cleanText: clean });
  emitToDashboard('VOICE_STATUS', { state: 'speaking', text: clean });

  try {
    await execAsync(`say "${clean}"`);
  } catch (error: any) {
    console.error('Error playing audio:', error?.message || error);
  } finally {
    isSpeaking = false;
    emitToDashboard('VOICE_STATUS', { state: 'idle' });
  }
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

  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter((l: string) => l.trim().length > 0);
    
    for (const line of lines) {
      try {
        const payload = JSON.parse(line);
        
        if (payload.status === 'ready') {
          console.log('✅ Voice Engine Ready. Listening for your voice...');
          emitToDashboard('VOICE_STATUS', { state: 'ready' });
          speak('Hi Boss. Ultron is online and listening. Just speak naturally.');
        } else if (payload.type === 'command') {
          if (isProcessing) {
            console.log(`⏳ [Queued]: "${payload.text}" (still processing previous command)`);
          } else if (!isSpeaking) {
            handleCommand(payload.text);
          } else {
            console.log(`⏳ [Queued]: "${payload.text}" (Buddy is speaking)`);
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

