import { spawn, exec } from 'child_process';
import util from 'util';
import path from 'path';
import { UltronAssistant } from './agents/assistant';
import { initDatabase } from './database';
import { popUltronDashboard } from './utils/window';

const execAsync = util.promisify(exec);
let assistant: UltronAssistant;
let isSpeaking = false;
let isProcessing = false;

// Simple TTS wrapper for macOS
async function speak(text: string) {
  isSpeaking = true;
  console.log(`\n🎙️ [Buddy]: ${text}\n`);
  try {
    // Sanitize text for CLI
    const safeText = text.replace(/"/g, '\\"').replace(/\n/g, ' ');
    await execAsync(`say "${safeText}"`);
  } catch (error) {
    console.error('Error playing audio:', error);
  } finally {
    isSpeaking = false;
  }
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
