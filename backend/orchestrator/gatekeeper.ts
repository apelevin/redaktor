import { PreSkeletonState, GateBlocker } from '@/lib/types';
import { runGateCheckStep } from './llm-step-runner';
import { applyLLMOutput } from './patch-applier';

/**
 * Проверяет готовность к skeleton через GATE_CHECK шаг
 */
export async function checkGate(
  state: PreSkeletonState
): Promise<{
  ready: boolean;
  summary: string;
  blockers?: GateBlocker[];
  updatedState: PreSkeletonState;
}> {
  // Запускаем GATE_CHECK шаг
  const llmOutput = await runGateCheckStep(state);
  
  // Применяем результат
  let updatedState = applyLLMOutput(state, llmOutput);
  
  // Извлекаем gate из обновленного state
  let gate = updatedState.gate;
  
  if (!gate) {
    // Логируем для отладки
    console.error('Gate check did not update gate field. LLM output:', JSON.stringify(llmOutput, null, 2));
    console.error('Updated state keys:', Object.keys(updatedState));
    
    // Создаем fallback gate, если LLM не вернул его
    const fallbackGate = {
      ready_for_skeleton: false,
      summary: 'Не удалось определить готовность. Требуется дополнительная информация.',
      blockers: [],
    };
    
    // Применяем fallback вручную
    updatedState = {
      ...updatedState,
      gate: fallbackGate,
    };
    
    gate = fallbackGate;
  }
  
  return {
    ready: gate.ready_for_skeleton,
    summary: gate.summary,
    blockers: gate.blockers,
    updatedState,
  };
}
