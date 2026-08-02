import { spawn, exec } from 'child_process';
import path from 'path';
import { UltronAssistant } from './agents/assistant';
import { initDatabase } from './database';
import { popUltronDashboard } from './utils/window';
import { emitToDashboard } from './services/socket';

let assistant: UltronAssistant;
let isSpeaking = false;
let isProcessing = false;
let activeTtsProcess: ReturnType<typeof spawn> | null = null;

function cleanTextForSpeech(rawText: string): string {
  return rawText
    .replace(/```[\s\S]*?```/g, 'code snippet.') // replace code blocks
    .replace(/`([^`]+)`/g, '$1') // remove backticks
    .replace(/#{1,6}\s*/g, '') // remove markdown headings
    .replace(/\*\*([^*]+)\*\*/g, '$1') // remove bold
    .replace(/\*([^*]+)\*/g, '$1') // remove italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // remove links
    .replace(/^[-*+]\s+/gm, '') // remove list bullets
    .replace(/[-_]{3,}/g, '') // remove horizontal rules
    .replace(/\n+/g, '. ') // replace newlines with pauses
    .replace(/\s{2,}/g, ' ') // collapse multiple spaces
    .trim();
}

/**
 * Instantly cuts off audio playback when Boss speaks / interrupts
 */
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
  emitToDashboard('VOICE_STATUS', { state: 'listening', message: 'Interrupted by Boss' });
}

// Safe TTS wrapper for macOS with instant interrupt support
export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    stopSpeaking(); // stop any prior speech

    isSpeaking = true;
    console.log(`\n🎙️ [Buddy]: ${text}\n`);

    const clean = cleanTextForSpeech(text);
    if (!clean) {
      isSpeaking = false;
      return resolve();
    }

    emitToDashboard('VOICE_BUDDY_SPEAKING', { text, cleanText: clean });
    emitToDashboard('VOICE_STATUS', { state: 'speaking', text: clean });

    activeTtsProcess = spawn('say', [clean]);

    activeTtsProcess.on('error', (err) => {
      console.error('Error playing audio:', err.message);
      isSpeaking = false;
      activeTtsProcess = null;
      emitToDashboard('VOICE_STATUS', { state: 'idle' });
      resolve();
    });

    activeTtsProcess.on('close', () => {
      isSpeaking = false;
      activeTtsProcess = null;
      emitToDashboard('VOICE_STATUS', { state: 'idle' });
      resolve();
    });
  });
}

async function handleCommand(text: string) {
  if (isProcessing) {
    // If Buddy is currently computing the answer, avoid double-processing chatter
    return;
  }

  isProcessing = true;

  try {
    console.log(`\n🗣️ [Boss]: ${text}`);
    
    // Broadcast user speech to UI
    emitToDashboard('VOICE_USER_SPEAKING', { text });
    emitToDashboard('VOICE_STATUS', { state: 'thinking', text });
    
    // ONLY open dashboard if Boss explicitly asks for it
    if (/(open|show|launch)\s+(dashboard|browser|ui|app|window)/i.test(text)) {
      popUltronDashboard();
    }

    // Check for quick interrupt / pause request
    const isWaitRequest = /^(wait|wait wait|hold on|pause|listen to me|hang on|stop)$/i.test(text.trim());
    if (isWaitRequest) {
      await speak("Okay Boss, I'm listening. What do you need?");
      return;
    }

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
        } else if (payload.type === 'interrupt') {
          console.log(`⚡ [Interrupt]: Boss spoke ("${payload.text}")`);
          stopSpeaking();
          handleCommand(payload.text);
        } else if (payload.type === 'command') {
          const lower = (payload.text || '').toLowerCase().trim();
          const isExplicitInterrupt = /^(wait|wait wait|stop|pause|hold on|shut up|hush|listen|listen to me|buddy|ultron|hey buddy)/i.test(lower) ||
            /(wait|stop speaking|shut up|pause speech|hold on)/i.test(lower);

          if (isSpeaking) {
            if (isExplicitInterrupt) {
              console.log(`⚡ [Barge-In]: Interrupting Buddy for Boss command: "${payload.text}"`);
              stopSpeaking();
              handleCommand(payload.text);
            } else {
              // Ignore speaker feedback / ambient noise while Buddy is talking
              // so audio is not abruptly killed
              return;
            }
          } else {
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
        // Debug print
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

