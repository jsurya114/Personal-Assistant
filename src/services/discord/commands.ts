// ============================================
// Ultron AI — Discord Slash Commands (Placeholder for Future)
// ============================================

import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { config } from '../../config';
import { logger } from '../../utils/logger';

export async function registerDiscordCommands() {
  const { token, channelId } = config.discord;
  
  if (!token) return;

  const commands = [
    new SlashCommandBuilder()
      .setName('briefing')
      .setDescription('Get your morning briefing'),
    new SlashCommandBuilder()
      .setName('jobs')
      .setDescription('Run a manual job search'),
    new SlashCommandBuilder()
      .setName('weather')
      .setDescription('Get the current weather'),
  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    // In a real app we need the clientId to register global commands.
    // For now, Buddy handles natural language via chat directly in the channel.
    logger.info('[DISCORD] Slash commands module ready (commands handled via NLP).');
  } catch (error) {
    logger.error(`[DISCORD] Failed to register slash commands: ${error}`);
  }
}
