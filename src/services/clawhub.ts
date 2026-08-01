import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

/**
 * Loads ClawHub skills downloaded into the .agents/skills folder
 * and converts their SKILL.md instructions into system prompt additions.
 */
export function loadClawHubSkills(): string {
  const skillsDir = path.resolve(process.cwd(), '.agents/skills');
  let injectedPrompt = '';

  if (!fs.existsSync(skillsDir)) return injectedPrompt;

  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Clawhub skills often install into nested namespaces, e.g. @author/skill-name
        if (entry.name.startsWith('@')) {
          const subDir = path.join(skillsDir, entry.name);
          const subEntries = fs.readdirSync(subDir, { withFileTypes: true });
          for (const sub of subEntries) {
            if (sub.isDirectory()) {
              injectedPrompt += readSkillFile(path.join(subDir, sub.name));
            }
          }
        } else {
          injectedPrompt += readSkillFile(path.join(skillsDir, entry.name));
        }
      }
    }
  } catch (error) {
    logger.error('Failed to load ClawHub skills', error);
  }

  return injectedPrompt;
}

function readSkillFile(skillPath: string): string {
  const skillFile = path.join(skillPath, 'SKILL.md');
  if (fs.existsSync(skillFile)) {
    const content = fs.readFileSync(skillFile, 'utf-8');
    logger.info(`Loaded ClawHub Skill from: ${skillPath}`);
    return `\n\n--- ClawHub Skill: ${path.basename(skillPath)} ---\n${content}\n-----------------------------------\n`;
  }
  return '';
}
