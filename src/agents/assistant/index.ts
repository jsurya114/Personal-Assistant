// ============================================
// Ultron AI — Core Assistant Agent (Buddy)
// Routes messages, maintains personality, coordinates agents
// ============================================

import { AIProvider } from '../../providers/ai/interface';
import { GroqProvider } from '../../providers/ai/groq.provider';
import { OpenAIProvider } from '../../providers/ai/openai.provider';
import { ClaudeProvider } from '../../providers/ai/claude.provider';
import { GeminiProvider } from '../../providers/ai/gemini.provider';
import { memoryManager } from '../memory';
import { ChatMessage, ChatRequest, ChatResponse, AgentType } from '../../types';
import { logger, logAgent } from '../../utils/logger';
import { getGreeting, formatDate, formatTime } from '../../utils/helpers';
import { getSqlite } from '../../database';
import { hunterAgent } from '../hunter';
import { sentinelAgent } from '../sentinel';
import { autoApplyAgent } from '../autoApply';
import { popUltronDashboard } from '../../utils/window';
import { parseResumeFolder } from '../../services/resumeParser';
import { config } from '../../config';
import { emitToDashboard } from '../../services/socket';
import { gitService } from '../../services/git';
import { liveSearchService } from '../../services/liveSearch';

// ---- Intent Detection ----

function detectIntent(message: string): AgentType {
  const lower = message.toLowerCase();

  const jobKeywords = ['job', 'apply', 'resume', 'application', 'career', 'interview', 'linkedin', 'salary', 'hire', 'position', 'opening'];
  const codeKeywords = ['code', 'debug', 'fix', 'build', 'write', 'function', 'bug', 'error', 'api', 'typescript', 'javascript', 'python', 'program', 'refactor', 'implement', 'git', 'push', 'pull', 'commit', 'branch', 'repo'];
  const researchKeywords = [
    'research', 'news', 'sports', 'cricket', 'football', 'match', 'score',
    'politics', 'election', 'minister', 'government', 'local', 'neighborhood',
    'chennai', 'india', 'today', 'happening', 'what is', 'explain', 'how does',
    'find out', 'search', 'look up', 'latest', 'trending', 'ai news', 'tech news',
    'who won', 'what happened', 'current', 'score'
  ];

  if (jobKeywords.some((k) => lower.includes(k))) return 'hunter';
  if (codeKeywords.some((k) => lower.includes(k))) return 'cipher';
  if (researchKeywords.some((k) => lower.includes(k))) return 'research';
  return 'assistant';
}

// ---- Provider Selection ----

function getProvider(): AIProvider {
  const preferred = config.ai.preferredProvider;

  if (preferred === 'groq') {
    const groq = new GroqProvider();
    if (groq.isAvailable()) return groq;
  }

  if (preferred === 'claude') {
    const claude = new ClaudeProvider();
    if (claude.isAvailable()) return claude;
  }

  if (preferred === 'gemini') {
    const gemini = new GeminiProvider();
    if (gemini.isAvailable()) return gemini;
  }

  // Priority order if preferred is not explicitly set or is default 'openai':
  // 1. Groq (if key set, fastest & free)
  const groq = new GroqProvider();
  if (groq.isAvailable()) return groq;

  // 2. OpenAI / Vercel AI
  const openai = new OpenAIProvider();
  if (openai.isAvailable()) return openai;

  // 3. Claude
  const claude = new ClaudeProvider();
  if (claude.isAvailable()) return claude;

  // 4. Gemini
  const gemini = new GeminiProvider();
  if (gemini.isAvailable()) return gemini;

  throw new Error(
    'No AI provider available. Set GROQ_API_KEY, VERCEL_AI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY in .env'
  );
}

// ---- System Prompts per Agent ----

const SYSTEM_PROMPTS: Record<AgentType, string> = {
  assistant: `You are Buddy, Ultron's personal AI operating assistant.
You are calm, professional, friendly, and always proactive.
You help Boss (Jayasurya) with daily tasks, questions, reminders, and life management.
You have long-term memory of all previous conversations.
Always address the user as "Boss". Never be robotic.`,

  hunter: `You are Buddy operating in Career Mode.
You help Boss find jobs, write cover letters, track applications, and prepare for interviews.
Boss is a Backend/Full Stack Developer skilled in Node.js, TypeScript, React, PostgreSQL, MongoDB, Docker, and AWS.
Preferred roles: Backend Developer, Full Stack Developer, MERN Developer, Software Engineer.
Be specific, actionable, and always look out for Boss's career growth.`,

  cipher: `You are Buddy operating in Coding Mode.
You help Boss write, debug, review, and understand code.
Preferred stack: TypeScript, Node.js, Express, React, Next.js, PostgreSQL, MongoDB, Docker, AWS.
Always provide working, production-quality code with proper error handling.
Explain your reasoning clearly.`,

  research: `You are Buddy operating in Research Mode.
You help Boss research topics, summarize news, explain technologies, and analyze information.
Provide well-structured, concise, and cited responses.
Focus on AI, technology, software engineering, and career-related topics.`,
};

// ---- Main Assistant ----

export class UltronAssistant {
  private provider: AIProvider;

  constructor() {
    this.provider = getProvider();
    logAgent('ULTRON', `Initialized with ${this.provider.name} (${this.provider.model})`);
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const { message, conversationId: existingId, stream } = request;
    const conversationId = existingId || memoryManager.newConversationId();

    // Detect intent and choose agent
    const agentType = detectIntent(message);
    logAgent('ULTRON', `Message routed to: ${agentType}`);

    // UI Action & Window Interceptor
    const lowerMessage = message.toLowerCase();
    if (/(open|show|pop|launch|see|view).* (ui|dashboard|screen|window|ultron|jobs)/i.test(lowerMessage) || lowerMessage.includes('buddy') || lowerMessage.includes('ultron')) {
      popUltronDashboard();
    }

    if (agentType === 'hunter' && /(show|list|see|view|get).*job/i.test(lowerMessage)) {
      emitToDashboard('SHOW_JOBS_PANEL');
    }

    // Build context — MEMORY.md + daily logs injected into system prompt
    const userMessage: ChatMessage = { role: 'user', content: message };

    // Dynamic Resume Analysis
    const resumeProfile = await parseResumeFolder();

    // If Auto-Apply intent
    let jobContext = '';
    if (/(auto.?apply|apply for jobs|easy apply|apply to linkedin|start applying)/i.test(lowerMessage)) {
      try {
        logAgent('AUTO-APPLY', 'Triggering LinkedIn Easy Apply automation...');
        popUltronDashboard();
        const results = await autoApplyAgent.runLinkedInEasyApply({
          query: 'Backend Developer Node.js',
          location: 'India',
          limit: 3,
          dryRun: true,
        });

        jobContext = `\n\n[AUTO-APPLY STATUS]: Processed ${results.length} LinkedIn Easy Apply applications in Review Mode. Form filled with Boss's resume (${resumeProfile.name}, ${resumeProfile.skills.slice(0, 5).join(', ')}). Tell Boss you have opened the review previews.`;
      } catch (e) {
        logAgent('AUTO-APPLY', `Auto apply failed: ${e}`);
        jobContext = '\n\nAuto apply encountered an error. Tell Boss to verify LinkedIn login in browser.';
      }
    }

    // If hunter intent, actually run job search and inject real results
    if (!jobContext && agentType === 'hunter' && /(job|search|find|hunt|look|backend|developer|role|position|opening|linkedin|indeed|resume)/i.test(lowerMessage)) {
      try {
        logAgent('HUNTER', `Executing real multi-agent job search matching resume (${resumeProfile.skills.length} skills parsed)...`);
        const searchResult = await hunterAgent.runJobSearch();
        let jobs = searchResult.newJobs.length > 0 ? searchResult.newJobs : hunterAgent.getTopJobMatches(5);
        
        if (jobs.length === 0) {
          jobs = await hunterAgent.searchJobsJSearch();
        }

        if (jobs.length > 0) {
          jobContext = `\n\n[LATEST MATCHING JOBS FOR BOSS MATCHED AGAINST REAL RESUME (${resumeProfile.skills.slice(0, 8).join(', ')})]:\n` +
            jobs.slice(0, 5).map((j, i) => 
              `${i+1}. **${j.role}** at ${j.company} (${j.location || 'India/Remote'}) — Match: ${j.matchScore}% [Platform: ${j.platform}]\n   Apply: ${j.url}`
            ).join('\n') + `\n\nBriefly summarize these top jobs for Boss and mention the company and role clearly.`;
          emitToDashboard('SHOW_JOBS_PANEL');
        } else {
          jobContext = '\n\nI searched across LinkedIn and Indeed but found no matching jobs right now. Tell Boss you checked and suggested refining the search query.';
        }
      } catch (error) {
        logAgent('HUNTER', `Job search failed: ${error}`);
        jobContext = '\n\nJob search encountered an error. Tell Boss you tried but the search API had an issue.';
      }
    }

    // If email / inbox check intent
    if (/(email|mail|inbox|job alert|interview mail|application mail|read my|read email|read inbox|check my email|any new mail|unread)/i.test(lowerMessage)) {
      try {
        logAgent('SENTINEL', 'Checking inbox for emails...');
        const inbox = await sentinelAgent.getRecentEmails(5);
        if (inbox.error) {
          jobContext += `\n\n[GMAIL INBOX STATUS]: ${inbox.error}`;
        } else if (inbox.emails.length > 0) {
          jobContext += `\n\n[REAL LIVE EMAILS FROM BOSS'S INBOX (${config.email.user})]:\n` +
            inbox.emails.map((e, i) => `${i+1}. From: ${e.from} | Subject: "${e.subject}" | Date: ${e.date}`).join('\n') +
            `\n\nIMPORTANT: You have successfully connected to Boss's live Gmail inbox. These are 100% real live emails. Summarize these emails directly for Boss with zero simulation disclaimers.`;
        } else {
          jobContext += `\n\n[GMAIL INBOX STATUS]: Checked inbox (${config.email.user}), but no new messages were found.`;
        }
      } catch (e) {
        logger.debug(`Email intent check: ${e}`);
      }
    }

    // If Git intent (push, pull, status, commit, remote)
    if (/(git push|push (my |the )?code|push (to |into )?git|push changes|git pull|pull (latest |my )?code|pull from git|git status|what changed|git log|git remote)/i.test(lowerMessage)) {
      try {
        logAgent('CIPHER-GIT', `Processing Git command: ${lowerMessage}`);
        
        // Remote setup
        const remoteMatch = lowerMessage.match(/(?:remote add|set remote|remote url|remote to)\s+(https?:\/\/[^\s]+|git@[^\s]+)/i);
        if (remoteMatch && remoteMatch[1]) {
          const res = await gitService.setRemote(remoteMatch[1]);
          jobContext += `\n\n[GIT ACTION RESULT]: ${res.message}. Inform Boss that remote origin has been configured.`;
        } else if (/push/i.test(lowerMessage)) {
          // Extract optional custom commit message: 'commit "message" and push'
          const msgMatch = lowerMessage.match(/(?:message|commit)\s+["']([^"']+)["']/i);
          const commitMsg = msgMatch ? msgMatch[1] : `Update from Boss via Ultron AI (${new Date().toLocaleDateString()})`;
          const pushRes = await gitService.commitAndPush(commitMsg);
          jobContext += `\n\n[LIVE GIT PUSH RESULT]: ${pushRes.message}` + (pushRes.output ? `\nOutput: ${pushRes.output}` : '') +
            `\n\nInform Boss of the exact push result clearly.`;
        } else if (/pull/i.test(lowerMessage)) {
          const pullRes = await gitService.pull();
          jobContext += `\n\n[LIVE GIT PULL RESULT]: ${pullRes.message}` + (pullRes.output ? `\nOutput: ${pullRes.output}` : '') +
            `\n\nInform Boss of the exact pull result clearly.`;
        } else {
          // Status
          const status = await gitService.getStatus();
          if (!status.isRepo) {
            jobContext += `\n\n[GIT STATUS]: Repository is not initialized yet. Tell Boss they can say 'git init' or provide a remote repository URL.`;
          } else {
            jobContext += `\n\n[LIVE GIT STATUS]: Repository is active and connected to remote: ${status.remoteUrl || 'origin'}. Branch: ${status.branch} | Clean: ${status.clean} | Modified files: ${status.modified.join(', ') || 'None'} | Untracked: ${status.untracked.slice(0, 5).join(', ') || 'None'}. Report this real live git status to Boss.`;
          }
        }
      } catch (e: any) {
        logAgent('CIPHER-GIT', `Git execution error: ${e.message}`);
        jobContext += `\n\n[GIT ERROR]: ${e.message}`;
      }
    }

    // If live news / sports / politics / neighborhood / web search intent
    if (
      agentType === 'research' ||
      /(news|sports|cricket|football|match|score|politics|election|minister|government|chennai|local|neighborhood|happening|who won|latest update|today's news|weather)/i.test(lowerMessage)
    ) {
      try {
        logAgent('RESEARCH', `Fetching real-time web & news data for: "${message}"`);
        const searchResults = await liveSearchService.searchNews(message);
        if (searchResults.length > 0) {
          jobContext += `\n\n[REAL-TIME LIVE NEWS & WEB SEARCH RESULTS (Current Date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })})]:\n` +
            searchResults.map((r, i) => `${i + 1}. **${r.title}** (${r.source || 'Live News'}, ${r.date || 'Today'})\n   Details: ${r.snippet}\n   URL: ${r.url}`).join('\n') +
            `\n\nIMPORTANT: Use these REAL-TIME, UP-TO-DATE search results from today (${new Date().getFullYear()}) to answer Boss accurately. Provide current, fresh details and never use outdated historical information.`;
        }
      } catch (err: any) {
        logger.warn(`Live search in assistant failed: ${err.message}`);
      }
    }

    const currentDateContext = `\n\n[SYSTEM CLOCK]: Current Local Time is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}, ${new Date().toLocaleTimeString()}. Always answer with reference to the year ${new Date().getFullYear()}.`;
    const systemPrompt = SYSTEM_PROMPTS[agentType] + currentDateContext + memoryManager.buildMemoryContext() + jobContext;
    const history = memoryManager.getContext(conversationId);
    const messages: ChatMessage[] = [...history, userMessage];

    // Add to short-term context
    memoryManager.addMessage(conversationId, userMessage);
    memoryManager.saveMessage(conversationId, userMessage);

    let responseContent = '';
    const fallbackProviders: AIProvider[] = [
      this.provider,
      new GeminiProvider(),
      new OpenAIProvider(),
      new ClaudeProvider(),
    ].filter((p, index, self) => p.isAvailable() && self.findIndex((s) => s.name === p.name) === index);

    let lastError: any;
    for (const prov of fallbackProviders) {
      try {
        if (stream && prov.stream) {
          const result = await prov.stream(messages, systemPrompt, (chunk) => {
            process.stdout.write(chunk);
          });
          responseContent = result.content;
        } else {
          const result = await prov.chat(messages, systemPrompt);
          responseContent = result.content;
        }
        if (responseContent && responseContent.trim().length > 0) {
          break;
        }
      } catch (err: any) {
        lastError = err;
        logger.warn(`[ULTRON] Provider ${prov.name} attempt failed: ${err?.message || err}. Attempting fallback provider...`);
      }
    }

    if (!responseContent || responseContent.trim().length === 0) {
      responseContent = `Boss, I encountered a temporary AI API error: ${lastError?.message || 'Rate limit'}. Please ask again.`;
    }

    const assistantMessage: ChatMessage = { role: 'assistant', content: responseContent };
    memoryManager.addMessage(conversationId, assistantMessage);
    memoryManager.saveMessage(conversationId, assistantMessage);

    // Log to daily memory file
    memoryManager.logConversation(message, responseContent, agentType);

    return {
      response: responseContent,
      conversationId,
      agent: agentType,
      timestamp: new Date().toISOString(),
    };
  }

  async generateMorningGreeting(briefing: string): Promise<string> {
    const greeting = getGreeting();
    const date = formatDate();
    const time = formatTime();

    const prompt = `Generate a natural morning greeting for Boss. 
Today is ${date}, ${time}.
Start with "${greeting} Boss."
Then include this briefing naturally: ${briefing}
End with "What's today's plan?"
Keep it warm, personal, and under 200 words.`;

    const result = await this.provider.chat(
      [{ role: 'user', content: prompt }],
      SYSTEM_PROMPTS.assistant
    );
    return result.content;
  }

  getProvider(): AIProvider {
    return this.provider;
  }
}

// Singleton
let _assistant: UltronAssistant | null = null;

export function getAssistant(): UltronAssistant {
  if (!_assistant) {
    _assistant = new UltronAssistant();
  }
  return _assistant;
}
