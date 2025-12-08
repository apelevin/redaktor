import { NextRequest, NextResponse } from 'next/server';
import { saveInstructionToPinecone } from '@/lib/pinecone/instructions';
import type { Instruction } from '@/types/instruction';

interface SaveInstructionRequest {
  instruction: Instruction;
}

export async function POST(request: NextRequest) {
  try {
    const body: SaveInstructionRequest = await request.json();
    const { instruction } = body;

    if (!instruction) {
      return NextResponse.json(
        { error: 'instruction is required' },
        { status: 400 }
      );
    }

    // Валидация обязательных полей инструкции
    if (!instruction.documentType || !instruction.jurisdiction || !instruction.whenToUse) {
      return NextResponse.json(
        { error: 'Invalid instruction format: missing required fields' },
        { status: 400 }
      );
    }

    // Сохранение инструкции в Pinecone
    const saveResult = await saveInstructionToPinecone(instruction);

    return NextResponse.json({
      id: saveResult.id,
    });
  } catch (error) {
    console.error('Error saving instruction to Pinecone:', error);
    
    // Логируем детали ошибки для отладки
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        // В development режиме возвращаем больше информации
        ...(process.env.NODE_ENV === 'development' && error instanceof Error && {
          stack: error.stack,
        }),
      },
      { status: 500 }
    );
  }
}

