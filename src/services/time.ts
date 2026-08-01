// ============================================
// Ultron AI — Time Service
// ============================================

export function getCurrentTime(): string {
  return new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export function getCurrentDate(): string {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function getTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function getTimeInfo() {
  const now = new Date();
  return {
    time: getCurrentTime(),
    date: getCurrentDate(),
    timezone: getTimezone(),
    hour: now.getHours(),
    dayOfWeek: now.toLocaleDateString('en-IN', { weekday: 'long' }),
    isMorning: now.getHours() >= 6 && now.getHours() < 12,
    isAfternoon: now.getHours() >= 12 && now.getHours() < 17,
    isEvening: now.getHours() >= 17 && now.getHours() < 21,
    isNight: now.getHours() >= 21 || now.getHours() < 6,
  };
}
