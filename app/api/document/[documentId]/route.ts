/**
 * API Route: /api/document/[documentId]
 * Returns current state of a document
 */

import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "@/backend/storage/in-memory";
import type { LegalDocument } from "@/lib/types";

export async function GET(
  request: NextRequest,
  { params }: { params: { documentId: string } }
) {
  try {
    const { documentId } = params;

    if (!documentId) {
      return NextResponse.json(
        { error: "Document ID is required" },
        { status: 400 }
      );
    }

    const storage = getStorage();
    const document = storage.getDocument(documentId);

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ document });
  } catch (error) {
    console.error("Error in /api/document/[documentId]:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}
