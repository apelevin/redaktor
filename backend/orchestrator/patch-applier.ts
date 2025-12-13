import { PreSkeletonState, LLMStepOutput, IssueUpsert } from '@/lib/types';
import { applyPatch } from '@/lib/json-patch';

/**
 * Применяет patch и issue_updates к state
 */
export function applyLLMOutput(
  state: PreSkeletonState,
  llmOutput: LLMStepOutput
): PreSkeletonState {
  // Применяем patch
  let updatedState = applyPatch(state, llmOutput.patch);
  
  // Применяем issue_updates
  if (llmOutput.issue_updates && llmOutput.issue_updates.length > 0) {
    updatedState = applyIssueUpdates(updatedState, llmOutput.issue_updates);
  }
  
  return updatedState;
}

/**
 * Применяет issue_updates к state
 */
function applyIssueUpdates(
  state: PreSkeletonState,
  issueUpdates: IssueUpsert[]
): PreSkeletonState {
  let issues = [...state.issues];
  
  for (const update of issueUpdates) {
    if (update.op === 'upsert') {
      // Находим существующий issue по id или key
      const existingIndex = issues.findIndex(
        (i) => i.id === update.issue.id || (update.issue.key && i.key === update.issue.key)
      );
      
      if (existingIndex >= 0) {
        // Обновляем существующий
        issues[existingIndex] = { ...issues[existingIndex], ...update.issue };
      } else {
        // Добавляем новый
        issues.push(update.issue);
      }
    } else if (update.op === 'resolve') {
      // Помечаем как resolved
      const issueIndex = issues.findIndex((i) => i.id === update.issue.id);
      if (issueIndex >= 0) {
        issues[issueIndex] = { ...issues[issueIndex], status: 'resolved' as const };
      }
    } else if (update.op === 'dismiss') {
      // Помечаем как dismissed
      const issueIndex = issues.findIndex((i) => i.id === update.issue.id);
      if (issueIndex >= 0) {
        issues[issueIndex] = { ...issues[issueIndex], status: 'dismissed' as const };
      }
    }
  }
  
  return {
    ...state,
    issues,
    meta: {
      ...state.meta,
      updated_at: new Date().toISOString(),
      state_version: (state.meta.state_version || 0) + 1,
    },
  };
}
