'use client';

import type { Clause } from '@/types/document';

interface ClauseViewProps {
  clause: Clause;
  onEdit?: (clauseId: string, content: string) => void;
}

export default function ClauseView({ clause, onEdit }: ClauseViewProps) {
  const sourceLabel = clause.source === 'rag' ? 'RAG' : 'LLM';
  const sourceColor = clause.source === 'rag' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';
  
  return (
    <div className="mb-4 p-4 border border-gray-200 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className={`px-2 py-1 rounded text-xs font-semibold ${sourceColor}`}>
          {sourceLabel}
        </span>
        {clause.metadata?.sourceType && (
          <span className="text-xs text-gray-500">
            {clause.metadata.sourceType}
          </span>
        )}
      </div>
      
      {onEdit ? (
        <textarea
          value={clause.content}
          onChange={(e) => onEdit(clause.id, e.target.value)}
          className="w-full p-2 border border-gray-300 rounded min-h-[100px]"
        />
      ) : (
        <div className="text-gray-700 whitespace-pre-wrap">
          {clause.content}
        </div>
      )}
      
      {clause.metadata?.assumptions && clause.metadata.assumptions.length > 0 && (
        <div className="mt-2 text-xs text-gray-500">
          <strong>Допущения:</strong> {clause.metadata.assumptions.join(', ')}
        </div>
      )}
      
      {clause.metadata?.sourceReference && (
        <div className="mt-1 text-xs text-gray-400">
          Источник: {clause.metadata.sourceReference}
        </div>
      )}
    </div>
  );
}


