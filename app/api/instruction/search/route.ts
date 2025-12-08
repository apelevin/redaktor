import { NextRequest, NextResponse } from 'next/server';
import { findInstructionCandidates } from '@/lib/pinecone/instructions';

interface SearchInstructionRequest {
  documentType: string;
  jurisdiction?: string;
  shortDescription?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: SearchInstructionRequest = await request.json();
    const { documentType, jurisdiction, shortDescription } = body;

    if (!documentType) {
      return NextResponse.json(
        { error: 'documentType is required' },
        { status: 400 }
      );
    }

    const candidates = await findInstructionCandidates({
      documentType,
      jurisdiction: jurisdiction || 'RU',
      shortDescription,
      topK: 5,
    });

    return NextResponse.json({ candidates });
  } catch (error) {
    console.error('Error searching instruction:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { findInstructionCandidates } from '@/lib/pinecone/instructions';

interface SearchInstructionRequest {
  documentType: string;
  jurisdiction?: string;
  shortDescription?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: SearchInstructionRequest = await request.json();
    const { documentType, jurisdiction, shortDescription } = body;

    if (!documentType) {
      return NextResponse.json(
        { error: 'documentType is required' },
        { status: 400 }
      );
    }

    // Ищем инструкции в Pinecone (topK)
    const candidates = await findInstructionCandidates({
      documentType,
      jurisdiction: jurisdiction || 'RU',
      shortDescription,
      topK: 5,
    });

    return NextResponse.json({
      candidates,
    });
  } catch (error) {
    console.error('Error searching instruction:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

