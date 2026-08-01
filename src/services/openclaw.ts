import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export async function askOpenClaw(message: string): Promise<string | null> {
  try {
    const safeMessage = message.replace(/"/g, '\\"');
    const { stdout } = await execAsync(`npx openclaw agent --message "${safeMessage}" --agent main --json`);
    
    // Attempt to extract the JSON block
    const lines = stdout.split('\n');
    let jsonStr = '';
    let isJson = false;
    for (const line of lines) {
      if (line.trim().startsWith('{')) isJson = true;
      if (isJson) jsonStr += line + '\n';
    }

    if (!jsonStr) return null;

    const data = JSON.parse(jsonStr);
    if (data && data.turn && data.turn.finalAssistantVisibleText) {
      return data.turn.finalAssistantVisibleText;
    }
    return null;
  } catch (error) {
    console.error('OpenClaw Gateway Error:', error);
    return null;
  }
}
