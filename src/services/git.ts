// ============================================
// Ultron AI — Git Automation Service
// Native Git CLI wrapper for push, pull, commit, status
// ============================================

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger, logAgent } from '../utils/logger';

const execAsync = promisify(exec);
const WORKSPACE_DIR = process.cwd();

export interface GitStatusResult {
  isRepo: boolean;
  branch: string;
  clean: boolean;
  modified: string[];
  untracked: string[];
  ahead: number;
  behind: number;
  remoteUrl?: string;
}

export interface GitActionResult {
  success: boolean;
  message: string;
  output?: string;
}

export class GitService {
  private cwd: string;

  constructor(cwd: string = WORKSPACE_DIR) {
    this.cwd = cwd;
  }

  /**
   * Run a raw git command safely
   */
  private async runGit(cmd: string): Promise<{ stdout: string; stderr: string }> {
    try {
      return await execAsync(`git ${cmd}`, { cwd: this.cwd });
    } catch (error: any) {
      throw new Error(error.stderr || error.message || String(error));
    }
  }

  /**
   * Check repository status
   */
  async getStatus(): Promise<GitStatusResult> {
    try {
      // Check if it's a git repo
      await this.runGit('rev-parse --is-inside-work-tree');
    } catch {
      return {
        isRepo: false,
        branch: 'none',
        clean: true,
        modified: [],
        untracked: [],
        ahead: 0,
        behind: 0,
      };
    }

    try {
      const { stdout: branchOut } = await this.runGit('branch --show-current');
      const branch = branchOut.trim() || 'main';

      const { stdout: statusOut } = await this.runGit('status --porcelain');
      const lines = statusOut.split('\n').filter(Boolean);

      const modified: string[] = [];
      const untracked: string[] = [];

      for (const line of lines) {
        const flag = line.substring(0, 2);
        const file = line.substring(3).trim();
        if (flag.includes('?')) {
          untracked.push(file);
        } else {
          modified.push(file);
        }
      }

      let remoteUrl = '';
      try {
        const { stdout: remoteOut } = await this.runGit('remote get-url origin');
        remoteUrl = remoteOut.trim();
      } catch {
        // No remote set
      }

      return {
        isRepo: true,
        branch,
        clean: lines.length === 0,
        modified,
        untracked,
        ahead: 0,
        behind: 0,
        remoteUrl: remoteUrl || undefined,
      };
    } catch (e: any) {
      logger.error('[GIT] getStatus error:', e);
      throw e;
    }
  }

  /**
   * Initialize a git repo and optionally set remote
   */
  async initRepo(remoteUrl?: string): Promise<GitActionResult> {
    try {
      logAgent('CIPHER-GIT', 'Initializing git repository...');
      await this.runGit('init');
      await this.runGit('branch -M main');

      if (remoteUrl) {
        try {
          await this.runGit(`remote add origin "${remoteUrl}"`);
        } catch {
          await this.runGit(`remote set-url origin "${remoteUrl}"`);
        }
      }

      return {
        success: true,
        message: 'Git repository initialized on branch main' + (remoteUrl ? ` with remote ${remoteUrl}` : ''),
      };
    } catch (e: any) {
      return { success: false, message: `Git init failed: ${e.message}` };
    }
  }

  /**
   * Set or update remote origin URL
   */
  async setRemote(remoteUrl: string): Promise<GitActionResult> {
    try {
      try {
        await this.runGit(`remote add origin "${remoteUrl}"`);
      } catch {
        await this.runGit(`remote set-url origin "${remoteUrl}"`);
      }
      return { success: true, message: `Remote origin set to ${remoteUrl}` };
    } catch (e: any) {
      return { success: false, message: `Failed to set remote: ${e.message}` };
    }
  }

  /**
   * Git Pull latest changes
   */
  async pull(branch?: string): Promise<GitActionResult> {
    try {
      logAgent('CIPHER-GIT', 'Pulling latest changes from remote...');
      const targetBranch = branch || 'main';
      const { stdout } = await this.runGit(`pull origin ${targetBranch}`);
      return {
        success: true,
        message: `Successfully pulled latest changes from origin/${targetBranch}`,
        output: stdout.trim(),
      };
    } catch (e: any) {
      return { success: false, message: `Git pull failed: ${e.message}` };
    }
  }

  /**
   * Git Add, Commit, and Push
   */
  async commitAndPush(message: string = 'Update from Boss via Ultron AI', branch?: string): Promise<GitActionResult> {
    try {
      logAgent('CIPHER-GIT', `Staging and committing changes with message: "${message}"`);
      
      // Ensure it's a git repo
      const status = await this.getStatus();
      if (!status.isRepo) {
        await this.initRepo();
      }

      // Add all changes (respecting .gitignore)
      await this.runGit('add -A');

      // Commit
      const sanitizedMsg = message.replace(/"/g, '\\"');
      try {
        await this.runGit(`commit -m "${sanitizedMsg}"`);
      } catch (commitErr: any) {
        if (commitErr.message.includes('nothing to commit')) {
          return { success: true, message: 'Working directory is clean. Nothing new to commit.' };
        }
        throw commitErr;
      }

      // Check remote
      const targetBranch = branch || (await this.getStatus()).branch || 'main';
      logAgent('CIPHER-GIT', `Pushing to origin ${targetBranch}...`);

      try {
        const { stdout } = await this.runGit(`push -u origin ${targetBranch}`);
        return {
          success: true,
          message: `Successfully committed and pushed all changes to origin/${targetBranch}!`,
          output: stdout.trim(),
        };
      } catch (pushErr: any) {
        // If remote doesn't exist yet
        if (pushErr.message.includes('No configured push destination') || pushErr.message.includes("does not appear to be a git repository")) {
          return {
            success: false,
            message: `Committed locally, but remote origin is not set yet. Please provide your GitHub repository URL (e.g. https://github.com/username/Ultron.git) so I can push!`,
          };
        }
        return {
          success: false,
          message: `Committed locally, but git push encountered an error: ${pushErr.message}`,
        };
      }
    } catch (e: any) {
      return { success: false, message: `Git commit/push failed: ${e.message}` };
    }
  }

  /**
   * Get recent commits
   */
  async getLog(limit: number = 5): Promise<string> {
    try {
      const { stdout } = await this.runGit(`log -n ${limit} --oneline`);
      return stdout.trim();
    } catch {
      return 'No commit history available.';
    }
  }
}

export const gitService = new GitService();
