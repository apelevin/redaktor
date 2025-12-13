import { applyPatch as applyJsonPatch, Operation, OperationResult } from 'fast-json-patch';
import { Patch, PreSkeletonState } from './types';

/**
 * Применяет patch к state
 */
export function applyPatch(state: PreSkeletonState, patch: Patch): PreSkeletonState {
  try {
    if (patch.format === 'json_patch') {
      // JSON Patch (RFC 6902)
      const ops = patch.ops as Operation[];
      
      // Логируем для отладки
      console.log('[applyPatch] Applying JSON Patch with', ops.length, 'operations');
      
      // Защита: не позволяем изменять dialogue.history напрямую (только append)
      const protectedPaths = ['/dialogue/history'];
      const hasProtectedOps = ops.some((op) => 
        protectedPaths.some((path) => op.path.startsWith(path) && (op.op === 'remove' || op.op === 'replace'))
      );
      
      if (hasProtectedOps) {
        throw new Error('Cannot modify protected paths (dialogue.history) via patch. Use append operations only.');
      }
      
      // Предварительно создаем недостающие пути для операций 'add' и 'replace'
      // Это необходимо, так как fast-json-patch не создает промежуточные объекты автоматически
      const stateClone = JSON.parse(JSON.stringify(state)) as PreSkeletonState;
      
      // Убеждаемся, что domain инициализирован
      if (!stateClone.domain) {
        stateClone.domain = {};
      }
      
      for (const op of ops) {
        // Для операций 'add' и 'replace' нужно убедиться, что путь существует
        if ((op.op === 'add' || op.op === 'replace') && op.path) {
          try {
            ensurePathExists(stateClone, op.path);
          } catch (error) {
            console.error(`[applyPatch] Failed to ensure path exists: ${op.path}`, error);
            console.error(`[applyPatch] Operation:`, JSON.stringify(op, null, 2));
            console.error(`[applyPatch] State clone keys:`, Object.keys(stateClone));
            throw new Error(`Failed to ensure path exists for operation: ${JSON.stringify(op)}. Error: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
      
      // Применяем patch
      // mutateDocument = false означает, что мы не изменяем оригинал
      let result: OperationResult[];
      try {
        result = applyJsonPatch(stateClone, ops, false, false);
      } catch (error) {
        console.error('[applyPatch] Failed to apply JSON Patch:', error);
        console.error('[applyPatch] Operations:', JSON.stringify(ops, null, 2));
        console.error('[applyPatch] State keys:', Object.keys(stateClone));
        throw new Error(`Failed to apply JSON Patch: ${error instanceof Error ? error.message : String(error)}`);
      }
    
    // Проверяем на ошибки
    // result - это массив OperationResult, проверяем каждый на наличие error
    const failedOps = result.filter((r) => {
      if (!r || typeof r !== 'object') return false;
      // Проверяем наличие error свойства
      return 'error' in r && r.error === true;
    });
    
    if (failedOps.length > 0) {
      const errorMessages = failedOps
        .map((r) => {
          if ('error' in r && typeof r.error === 'object' && r.error !== null) {
            return JSON.stringify(r.error);
          }
          return 'Unknown error';
        })
        .join(', ');
      throw new Error(`Failed to apply patch operations: ${errorMessages}`);
    }
    
    // Получаем обновленный state из результата
    // result - это массив OperationResult, последний элемент содержит финальный newDocument
    let updated: PreSkeletonState;
    if (result.length > 0) {
      const lastResult = result[result.length - 1];
      if (lastResult && typeof lastResult === 'object' && 'newDocument' in lastResult) {
        updated = lastResult.newDocument as PreSkeletonState;
      } else {
        // Логируем для отладки
        console.warn('[applyPatch] Unexpected result structure:', JSON.stringify(lastResult, null, 2));
        // Fallback: если структура неожиданная, используем исходный state
        updated = state;
      }
    } else {
      // Если результат пустой, используем исходный state
      console.warn('[applyPatch] Empty result array');
      updated = state;
    }
    
    // Обновляем метаданные
    updated.meta.updated_at = new Date().toISOString();
    updated.meta.state_version = (updated.meta.state_version || 0) + 1;
    
      return updated;
    } else {
      // Merge Patch (RFC 7396)
      let mergeOps = patch.ops as Record<string, unknown>;
      
      // Обрабатываем пути с "/" (неправильный формат, но поддерживаем для совместимости)
      // Если есть ключи вида "/gate", преобразуем их в "gate"
      const normalizedOps: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(mergeOps)) {
        const normalizedKey = key.startsWith('/') ? key.slice(1) : key;
        normalizedOps[normalizedKey] = value;
      }
      mergeOps = normalizedOps;
      
      // Рекурсивное слияние
      const merged = deepMerge(state, mergeOps) as PreSkeletonState;
      
      // Обновляем метаданные
      merged.meta.updated_at = new Date().toISOString();
      merged.meta.state_version = (merged.meta.state_version || 0) + 1;
      
      return merged;
    }
  } catch (error) {
    console.error('[applyPatch] Error applying patch:', error);
    console.error('[applyPatch] Patch:', JSON.stringify(patch, null, 2));
    console.error('[applyPatch] State keys:', Object.keys(state));
    throw new Error(`Failed to apply patch: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Убеждается, что путь существует в объекте, создавая промежуточные объекты при необходимости
 */
function ensurePathExists(obj: any, path: string): void {
  if (!path || path === '/') return;
  
  // Убираем ведущий '/'
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const parts = cleanPath.split('/');
  
  // Убираем последний элемент (это то, что мы хотим добавить)
  const pathToCreate = parts.slice(0, -1);
  
  if (pathToCreate.length === 0) return; // Путь уже на корневом уровне
  
  let current = obj;
  
  // Проверяем, что obj не undefined/null
  if (current === undefined || current === null) {
    throw new Error(`Cannot create path ${path}: root object is ${current}`);
  }
  
  for (let i = 0; i < pathToCreate.length; i++) {
    const part = pathToCreate[i];
    
    // Если current стал undefined/null, это ошибка
    if (current === undefined || current === null) {
      throw new Error(`Cannot create path ${path}: intermediate object at ${pathToCreate.slice(0, i).join('/')} is ${current}`);
    }
    
    // Проверяем, является ли текущая часть индексом массива
    const isCurrentPartArrayIndex = /^\d+$/.test(part);
    const nextPart = i < pathToCreate.length - 1 ? pathToCreate[i + 1] : null;
    const isNextPartArrayIndex = nextPart && /^\d+$/.test(nextPart);
    
    // Если current - это массив, и part - это индекс
    if (Array.isArray(current) && isCurrentPartArrayIndex) {
      const index = parseInt(part, 10);
      // Если индекс выходит за границы массива, расширяем массив
      while (current.length <= index) {
        current.push(null);
      }
      // Если элемент null или не объект, заменяем на объект
      if (current[index] === null || typeof current[index] !== 'object' || Array.isArray(current[index])) {
        current[index] = isNextPartArrayIndex ? [] : {};
      }
      current = current[index];
    } else if (!(part in current)) {
      // Свойства нет - создаем объект или массив в зависимости от следующей части
      current[part] = isNextPartArrayIndex ? [] : {};
      current = current[part];
    } else if (current[part] === null) {
      // null заменяем на объект/массив
      current[part] = isNextPartArrayIndex ? [] : {};
      current = current[part];
    } else if (Array.isArray(current[part])) {
      // Если это массив, оставляем как есть (не перезаписываем)
      // Но если следующий элемент не индекс, это ошибка
      if (!isNextPartArrayIndex && nextPart) {
        console.warn(`[ensurePathExists] Path ${path}: part ${part} is array but next part ${nextPart} is not an index. Keeping array.`);
      }
      current = current[part];
    } else if (typeof current[part] !== 'object') {
      // Если это не объект и не массив, заменяем на объект
      console.warn(`[ensurePathExists] Path ${path}: part ${part} is ${typeof current[part]}, replacing with object.`);
      current[part] = isNextPartArrayIndex ? [] : {};
      current = current[part];
    } else {
      // Это объект, просто переходим к нему
      current = current[part];
    }
    
    // Проверяем, что current не стал undefined/null после присваивания
    if (current === undefined || current === null) {
      // Это не должно происходить, но на всякий случай
      current = isNextPartArrayIndex ? [] : {};
      // Устанавливаем обратно
      const parentPath = pathToCreate.slice(0, i);
      let parent = obj;
      for (const p of parentPath) {
        if (Array.isArray(parent) && /^\d+$/.test(p)) {
          parent = parent[parseInt(p, 10)];
        } else {
          parent = parent[p];
        }
      }
      if (Array.isArray(parent) && /^\d+$/.test(part)) {
        parent[parseInt(part, 10)] = current;
      } else {
        parent[part] = current;
      }
    }
  }
}

/**
 * Рекурсивное слияние объектов (для merge_patch)
 */
function deepMerge(target: unknown, source: unknown): PreSkeletonState {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    return source as PreSkeletonState;
  }
  
  if (typeof target !== 'object' || target === null || Array.isArray(target)) {
    return source as PreSkeletonState;
  }
  
  const result = { ...(target as Record<string, unknown>) };
  
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (key in result && typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key])) {
      result[key] = deepMerge(result[key], value) as unknown;
    } else {
      result[key] = value;
    }
  }
  
  return (result as unknown) as PreSkeletonState;
}

/**
 * Добавляет сообщение в dialogue.history (безопасный способ)
 */
export function appendDialogueTurn(
  state: PreSkeletonState,
  turn: { role: 'user' | 'assistant' | 'system'; text: string }
): PreSkeletonState {
  const newTurn = {
    id: `turn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    role: turn.role,
    text: turn.text,
    at: new Date().toISOString(),
  };
  
  return {
    ...state,
    dialogue: {
      ...state.dialogue,
      history: [...state.dialogue.history, newTurn],
    },
    meta: {
      ...state.meta,
      updated_at: new Date().toISOString(),
      state_version: (state.meta.state_version || 0) + 1,
    },
  };
}

/**
 * Добавляет вопрос в dialogue.asked (для дедупликации)
 */
export function addAskedQuestion(
  state: PreSkeletonState,
  question: { id?: string; text: string; semantic_fingerprint?: string }
): PreSkeletonState {
  const askedQuestion = {
    id: question.id || `question_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    text: question.text,
    at: new Date().toISOString(),
    semantic_fingerprint: question.semantic_fingerprint,
  };
  
  return {
    ...state,
    dialogue: {
      ...state.dialogue,
      asked: [...state.dialogue.asked, askedQuestion],
    },
    meta: {
      ...state.meta,
      updated_at: new Date().toISOString(),
      state_version: (state.meta.state_version || 0) + 1,
    },
  };
}
