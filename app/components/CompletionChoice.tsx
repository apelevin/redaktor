'use client';

import type { CompletionMessage } from '@/types/completion';
import type { Question } from '@/types/question';

interface CompletionChoiceProps {
  message: CompletionMessage;
  onGenerate: () => void;
  onContinue: (questions: Question[]) => void;
  questions: Question[];
}

export default function CompletionChoice({
  message,
  onGenerate,
  onContinue,
  questions,
}: CompletionChoiceProps) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
      <div className="text-sm text-gray-700">
        {message.message}
      </div>
      
      {message.summaryTopics.length > 0 && (
        <div className="text-xs text-gray-600">
          <span className="font-medium">Темы для уточнения:</span>{' '}
          {message.summaryTopics.join(', ')}
        </div>
      )}

      <div className="flex gap-3">
        {message.buttons.map((button) => {
          if (button.id === 'generate') {
            return (
              <button
                key={button.id}
                onClick={onGenerate}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                {button.label}
              </button>
            );
          }
          
          if (button.id === 'continue') {
            return (
              <button
                key={button.id}
                onClick={() => onContinue(questions)}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                {button.label}
              </button>
            );
          }
          
          return null;
        })}
      </div>
    </div>
  );
}


