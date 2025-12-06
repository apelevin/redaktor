'use client';

import { useDocumentStore, useCanGenerateContract } from '@/lib/store/document-store';

export default function DocumentPanel() {
  const { documentType, context, completionState } = useDocumentStore();
  const canGenerateContract = useCanGenerateContract();

  return (
    <div className="h-full bg-white border-r border-gray-200 p-6 overflow-y-auto">
      <h2 className="text-2xl font-bold mb-4">Документ</h2>
      
      {!documentType ? (
        <div className="text-gray-500">
          <p>Выберите тип документа, чтобы начать создание.</p>
          <p className="mt-4 text-sm">Документ будет отображаться здесь после сбора информации.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-2">Тип документа:</h3>
            <p className="text-gray-700">{documentType}</p>
          </div>

          {completionState && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Статус заполненности:</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">Ключевые вопросы:</span>
                  <span className={`font-medium ${completionState.mustCompleted ? 'text-green-600' : 'text-gray-600'}`}>
                    {completionState.mustAnswered}/{completionState.mustTotal}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">Рекомендованные:</span>
                  <span className="text-gray-600">
                    {completionState.recommendedAnswered}/{completionState.recommendedTotal}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${completionState.overallCoverage * 100}%` }}
                  />
                </div>
                {completionState.mustCompleted && (
                  <p className="text-sm text-green-600 font-medium mt-2">
                    ✓ Ключевые параметры собраны
                  </p>
                )}
              </div>
            </div>
          )}
          
          <div>
            <h3 className="text-lg font-semibold mb-2">Собранный контекст:</h3>
            {Object.keys(context).length === 0 ? (
              <p className="text-gray-500 text-sm">Контекст пока пуст</p>
            ) : (
              <pre className="bg-gray-50 p-4 rounded-lg text-sm overflow-x-auto max-h-96">
                {JSON.stringify(context, null, 2)}
              </pre>
            )}
          </div>

          {canGenerateContract && (
            <div className="pt-4 border-t border-gray-200">
              <button
                onClick={() => {
                  // TODO: Реализовать генерацию договора
                  alert('Генерация договора будет реализована позже');
                }}
                className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
              >
                Сформировать договор
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

