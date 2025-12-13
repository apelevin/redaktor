import { applyPatch as applyJsonPatch, Operation, OperationResult } from 'fast-json-patch';
import { Patch, PreSkeletonState } from './types';

/**
 * Применяет patch к state
 */
export function applyPatch(state: PreSkeletonState, patch: Patch): PreSkeletonState {
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
    
    // Применяем patch
    // Клонируем state перед применением, чтобы не изменять оригинал
    const stateClone = JSON.parse(JSON.stringify(state)) as PreSkeletonState;
    // mutateDocument = true означает, что мы изменяем клон
    const result = applyJsonPatch(stateClone, ops, false, false);
    
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
