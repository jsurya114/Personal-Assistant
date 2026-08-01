// ============================================
// Ultron AI — Discord Bot Integration
// ============================================

import { Client, GatewayIntentBits, Events, Message } from 'discord.js';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { getAssistant } from '../../agents/assistant';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

export async function initDiscordBot() {
  const { token, channelId } = config.discord;

  if (!token) {
    logger.warn('[DISCORD] Token not found. Bot disabled.');
    return;
  }

  client.once(Events.ClientReady, (readyClient) => {
    logger.info(`[DISCORD] ✅ Bot logged in as ${readyClient.user.tag}`);
    // Register slash commands here if needed in the future
  });

  client.on(Events.MessageCreate, async (message: Message) => {
    // Ignore own messages or bot messages
    if (message.author.bot) return;

    // Only respond in the configured channel, or in DMs if channelId is not set/matches
    if (channelId && message.channelId !== channelId && message.channel.type !== 1) { // 1 is DM
      return;
    }

    // Optional: Only respond to Boss
    if (config.discord.userId && message.author.id !== config.discord.userId) {
      return;
    }

    // Check if the bot was mentioned, or if it's a DM, or if it's the dedicated channel
    const isMentioned = message.mentions.has(client.user!.id);
    const isDirectMessage = message.channel.type === 1;
    const isDedicatedChannel = channelId && message.channelId === channelId;

    if (isMentioned || isDirectMessage || isDedicatedChannel) {
      // Remove mention from content
      const content = message.content.replace(`<@${client.user!.id}>`, '').trim();
      
      if (!content) return;

      try {
        if ('sendTyping' in message.channel) {
          await message.channel.sendTyping();
        }

        const assistant = getAssistant();
        const responseData = await assistant.chat({ message: content, conversationId: 'discord-session' });
        const response = responseData.response;

        // Discord has a 2000 char limit per message.
        if (response.length > 2000) {
          const chunks = response.match(/[\s\S]{1,1900}/g) || [];
          for (const chunk of chunks) {
            await message.reply(chunk);
          }
        } else {
          await message.reply(response);
        }
      } catch (error) {
        logger.error(`[DISCORD] Error processing message: ${error}`);
        await message.reply('❌ Sorry Boss, I encountered an error processing that request.');
      }
    }
  });

  try {
    await client.login(token);
  } catch (error) {
    logger.error(`[DISCORD] Failed to login: ${error}`);
  }
}

// Push notification sender
export async function sendDiscordAlert(content: string) {
  const { userId } = config.discord;
  if (!client.isReady() || !userId) return;

  try {
    const user = await client.users.fetch(userId);
    if (user) {
      if (content.length > 2000) {
        const chunks = content.match(/[\s\S]{1,1900}/g) || [];
        for (const chunk of chunks) {
          await user.send(chunk);
        }
      } else {
        await user.send(content);
      }
    }
  } catch (error) {
    logger.error(`[DISCORD] Failed to send alert to user ${userId}: ${error}`);
  }
}
