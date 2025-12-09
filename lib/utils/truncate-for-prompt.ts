export function truncateForPrompt(text: string, limit: number, marker = '... [TRUNCATED]'): string {
  if (limit <= 0) {
    return '';
  }

  if (text.length <= limit) {
    return text;
  }

  const safeLimit = Math.max(limit - marker.length, 0);
  const prefix = safeLimit > 0 ? text.slice(0, safeLimit) : '';

  return `${prefix}${marker}`;
}
