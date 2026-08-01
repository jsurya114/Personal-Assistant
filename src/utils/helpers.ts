// ============================================
// Ultron AI — Helper Utilities
// ============================================



export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

export function formatDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatTime(date: Date = new Date()): string {
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  if (hour < 21) return 'Good Evening';
  return 'Good Night';
}

export function isNightTime(): boolean {
  const hour = new Date().getHours();
  return hour >= 22 || hour < 6;
}

export function isMorning(): boolean {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 10;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

export function sanitizeForLog(text: string): string {
  return text.replace(/sk-[a-zA-Z0-9-]+/g, '[REDACTED]');
}

export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export function calculateMatchScore(
  resumeSkills: string[],
  jobKeywords: string[]
): number {
  if (!jobKeywords.length) return 0;
  const normalizedResume = resumeSkills.map((s) => s.toLowerCase().trim());
  const normalizedJob = jobKeywords.map((k) => k.toLowerCase().trim());
  const matches = normalizedJob.filter((k) =>
    normalizedResume.some((s) => s.includes(k) || k.includes(s))
  );
  return Math.round((matches.length / normalizedJob.length) * 100);
}
