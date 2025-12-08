'use client';

import type { Instruction } from '@/types/instruction';

interface InstructionViewProps {
  instruction: Instruction;
}

export default function InstructionView({ instruction }: InstructionViewProps) {
  return (
    <div className="space-y-6">
      {/* Заголовок и основная информация */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Инструкция по документу</h2>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              instruction.instructionQuality === 'high' 
                ? 'bg-green-100 text-green-800'
                : instruction.instructionQuality === 'medium'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-gray-100 text-gray-800'
            }`}>
              Качество: {instruction.instructionQuality === 'high' ? 'Высокое' : instruction.instructionQuality === 'medium' ? 'Среднее' : 'Низкое'}
            </span>
          </div>
        </div>
        
        <div className="space-y-2 mb-4">
          <div>
            <span className="font-medium text-gray-700">Тип документа:</span>{' '}
            <span className="text-gray-900">{instruction.documentType}</span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Юрисдикция:</span>{' '}
            <span className="text-gray-900">{instruction.jurisdiction}</span>
          </div>
        </div>
      </div>

      {/* Когда использовать */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-xl font-semibold mb-3">Когда использовать</h3>
        <p className="text-gray-700 whitespace-pre-wrap">{instruction.whenToUse}</p>
      </div>

      {/* Требуемые данные от пользователя */}
      {instruction.requiredUserInputs && instruction.requiredUserInputs.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-xl font-semibold mb-3">Требуемые данные от пользователя</h3>
          <ul className="space-y-2">
            {instruction.requiredUserInputs.map((input, index) => {
              // Обрабатываем случай, когда input может быть объектом
              let displayText: string;
              if (typeof input === 'string') {
                displayText = input;
              } else if (typeof input === 'object' && input !== null) {
                // Если это объект с полями group/questions, извлекаем текст
                if ('group' in input && 'questions' in input) {
                  displayText = `${(input as any).group}: ${Array.isArray((input as any).questions) ? (input as any).questions.join(', ') : JSON.stringify((input as any).questions)}`;
                } else if ('text' in input) {
                  displayText = (input as any).text;
                } else {
                  displayText = JSON.stringify(input);
                }
              } else {
                displayText = String(input);
              }
              
              return (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">•</span>
                  <span className="text-gray-700">{displayText}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Рекомендуемая структура */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-xl font-semibold mb-4">Рекомендуемая структура документа</h3>
        <div className="space-y-4">
          {instruction.recommendedStructure.map((section, index) => (
            <div
              key={section.sectionKey}
              className={`border-l-4 p-4 rounded ${
                section.isMandatory
                  ? 'border-red-500 bg-red-50'
                  : 'border-blue-500 bg-blue-50'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <h4 className="font-semibold text-gray-900">{section.title}</h4>
                {section.isMandatory && (
                  <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded">
                    Обязательный
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 mb-1">
                <span className="font-medium">Ключ:</span> {section.sectionKey}
              </p>
              <p className="text-gray-700">{section.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Стилистические подсказки */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-xl font-semibold mb-4">Стилистические подсказки</h3>
        <div className="space-y-3">
          <div>
            <span className="font-medium text-gray-700">Тон:</span>{' '}
            <span className="text-gray-900">{instruction.styleHints.tone}</span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Профиль риска:</span>{' '}
            <span className={`px-2 py-1 rounded text-sm ${
              instruction.styleHints.riskProfile === 'conservative'
                ? 'bg-red-100 text-red-800'
                : instruction.styleHints.riskProfile === 'aggressive'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-green-100 text-green-800'
            }`}>
              {instruction.styleHints.riskProfile === 'conservative' 
                ? 'Консервативный'
                : instruction.styleHints.riskProfile === 'aggressive'
                ? 'Агрессивный'
                : 'Сбалансированный'}
            </span>
          </div>
          
          {instruction.styleHints.mustHaveSections.length > 0 && (
            <div>
              <span className="font-medium text-gray-700 block mb-2">Обязательные разделы:</span>
              <div className="flex flex-wrap gap-2">
                {instruction.styleHints.mustHaveSections.map((sectionKey) => (
                  <span
                    key={sectionKey}
                    className="px-2 py-1 bg-red-100 text-red-800 text-sm rounded"
                  >
                    {sectionKey}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {instruction.styleHints.notes.length > 0 && (
            <div>
              <span className="font-medium text-gray-700 block mb-2">Заметки:</span>
              <ul className="space-y-1">
                {instruction.styleHints.notes.map((note, index) => (
                  <li key={index} className="text-gray-700 text-sm flex items-start gap-2">
                    <span className="text-gray-400 mt-1">•</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Используемые плейсхолдеры */}
      {instruction.placeholdersUsed.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-xl font-semibold mb-3">Используемые плейсхолдеры</h3>
          <div className="flex flex-wrap gap-2">
            {instruction.placeholdersUsed.map((placeholder) => (
              <span
                key={placeholder}
                className="px-3 py-1 bg-gray-100 text-gray-800 text-sm rounded font-mono"
              >
                {placeholder}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

