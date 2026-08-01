// ============================================
// Ultron AI — Window Manager (Auto-Pop UI on Wake Word)
// ============================================

import { exec } from 'child_process';
import { emitToDashboard } from '../services/socket';
import { logger } from './logger';

/**
 * Automatically opens or focuses the Ultron Dashboard on macOS.
 */
export function popUltronDashboard(url: string = 'http://localhost:3000'): void {
  // 1. Emit real-time WebSocket event to any open dashboard tabs
  emitToDashboard('SHOW_JOBS_PANEL');
  emitToDashboard('WAKE_WORD_TRIGGERED');

  // 2. On macOS, open Chrome or default browser window to localhost:3000
  // Uses AppleScript / 'open' command to focus smoothly
  const command = `osascript -e '
    tell application "Google Chrome"
      activate
      set found to false
      repeat with w in windows
        set tabIndex to 0
        repeat with t in tabs of w
          set tabIndex to tabIndex + 1
          if URL of t starts with "${url}" then
            set active tab index of w to tabIndex
            set index of w to 1
            set found to true
            exit repeat
          end if
        end repeat
        if found then exit repeat
      end repeat
      if not found then
        open location "${url}"
      end if
    end tell
  ' 2>/dev/null || open "${url}"`;

  exec(command, (err) => {
    if (err) {
      // Fallback to standard open command
      exec(`open "${url}"`);
    } else {
      logger.debug('[WINDOW] 🖥️ Dashboard brought to front.');
    }
  });
}
