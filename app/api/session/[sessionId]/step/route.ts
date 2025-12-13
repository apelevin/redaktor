import { NextRequest, NextResponse } from 'next/server';
import { runInterpretStep, runGateCheckStep } from '@/backend/orchestrator/llm-step-runner';
import { applyLLMOutput } from '@/backend/orchestrator/patch-applier';
import { getSessionStorage } from '@/backend/storage/session-storage';
import { RunStepRequest, RunStepResponse } from '@/lib/types';

/**
 * POST /api/session/[sessionId]/step
 * Принудительно запускает LLM step (для отладки)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const sessionId = params.sessionId;
    const body: RunStepRequest = await request.json();
    
    const storage = getSessionStorage();
    const state = storage.getState(sessionId);
    
    if (!state) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }
    
    let llmOutput;
    
    if (body.step === 'INTERPRET') {
      // Для INTERPRET нужен последний message
      const lastUserMessage = state.dialogue.history
        .filter((turn) => turn.role === 'user')
        .pop()?.text || '';
      
      if (!lastUserMessage) {
        return NextResponse.json(
          { error: 'No user message found for INTERPRET step' },
          { status: 400 }
        );
      }
      
      llmOutput = await runInterpretStep(state, lastUserMessage);
    } else if (body.step === 'GATE_CHECK') {
      llmOutput = await runGateCheckStep(state);
    } else {
      return NextResponse.json(
        { error: `Unknown step: ${body.step}` },
        { status: 400 }
      );
    }
    
    // Применяем результат
    const updatedState = applyLLMOutput(state, llmOutput);
    storage.saveState(sessionId, updatedState);
    
    const response: RunStepResponse = {
      llm_output: llmOutput,
      state: updatedState,
      next_action: llmOutput.next_action,
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error running step:', error);
    return NextResponse.json(
      {
        error: 'Failed to run step',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
