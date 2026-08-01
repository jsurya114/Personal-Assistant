import { spawn } from 'child_process';
import path from 'path';
import { UltronAssistant } from './agents/assistant';
import { initDatabase } from './database';
import { popUltronDashboard } from './utils/window';

let assistant: UltronAssistant;
let isSpeaking = false;
let isProcessing = false;

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

// Safe TTS wrapper for macOS using direct process invocation
function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    isSpeaking = true;
    console.log(`\n🎙️ [Buddy]: ${text}\n`);

    const clean = cleanTextForSpeech(text);
    if (!clean) {
      isSpeaking = false;
      return resolve();
    }

    const child = spawn('say', [clean]);

    child.on('error', (err) => {
      console.error('Error playing audio:', err.message);
      isSpeaking = false;
      resolve();
    });

    child.on('close', () => {
      isSpeaking = false;
      resolve();
    });
  });
}

async function handleCommand(text: string) {
  if (isProcessing) return; // Prevent overlapping requests
  isProcessing = true;

  try {
    console.log(`\n🗣️ [Boss]: ${text}`);
    
    // Auto-focus dashboard UI on screen
    popUltronDashboard();

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

function startVoiceDaemon() {
  console.log('🤖 Initializing Ultron Voice Engine...');
  
  const pythonExecutable = path.resolve(__dirname, '../.venv/bin/python');
  const listenerScript = path.resolve(__dirname, '../voice_listener.py');

  const child = spawn(pythonExecutable, [listenerScript]);

  child.stdout.on('data', (data) => {
    // Python might flush multiple JSON lines at once
    const lines = data.toString().split('\n').filter((l: string) => l.trim().length > 0);
    
    for (const line of lines) {
      try {
        const payload = JSON.parse(line);
        
        if (payload.status === 'ready') {
          console.log('✅ Voice Engine Ready. Listening for your voice...');
          speak('Hi Boss. Ultron is online and listening. Just speak naturally.');
        } else if (payload.type === 'command') {
          if (isProcessing) {
            console.log(`⏳ [Queued]: "${payload.text}" (still processing previous command)`);
          } else if (!isSpeaking) {
            handleCommand(payload.text);
          } else {
            console.log(`⏳ [Queued]: "${payload.text}" (Buddy is still speaking)`);
          }
        } else if (payload.type === 'deactivate') {
          console.log(`😴 [Buddy]: Going quiet. Say "Buddy" or any command to wake me up.`);
        } else if (payload.type === 'transcript') {
          console.log(`👂 [Ambient]: "${payload.text}"`);
        } else if (payload.type === 'error') {
          console.error(`⚠️ [STT Warning]: ${payload.message}`);
        }
      } catch (e) {
        // Not JSON, maybe a debug print from python
        console.log('[Python STT Debug]:', line);
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

// Start the Daemon
(async () => {
  try {
    await initDatabase();
    assistant = new UltronAssistant();
    startVoiceDaemon();
  } catch (error) {
    console.error('Failed to start Voice Engine:', error);
  }
})();
