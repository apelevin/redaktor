import { PreSkeletonState } from '@/lib/types';

/**
 * In-memory хранилище для сессий
 * В будущем можно заменить на БД (PostgreSQL, MongoDB и т.д.)
 */
class SessionStorage {
  private sessions = new Map<string, PreSkeletonState>();

  /**
   * Получает state по session_id
   */
  getState(sessionId: string): PreSkeletonState | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Сохраняет state
   */
  saveState(sessionId: string, state: PreSkeletonState): void {
    this.sessions.set(sessionId, state);
  }

  /**
   * Удаляет state
   */
  deleteState(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Проверяет существование сессии
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Получает все session_id (для отладки)
   */
  getAllSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Очищает все сессии (для тестирования)
   */
  clear(): void {
    this.sessions.clear();
  }
}

// Singleton instance
// В Next.js нужно использовать глобальный объект для сохранения между запросами
// В production лучше использовать БД или Redis
const globalForStorage = globalThis as unknown as {
  sessionStorage: SessionStorage | undefined;
};

/**
 * Получает экземпляр SessionStorage
 * Использует globalThis для сохранения между запросами в Next.js
 */
export function getSessionStorage(): SessionStorage {
  if (!globalForStorage.sessionStorage) {
    globalForStorage.sessionStorage = new SessionStorage();
    console.log('[SessionStorage] Created new instance');
  }
  return globalForStorage.sessionStorage;
}
