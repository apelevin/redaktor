'use client';

import { useDocumentStore } from '@/lib/store/document-store';

export default function DocumentPanel() {
  const { documentType, context } = useDocumentStore();

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
          
          <div>
            <h3 className="text-lg font-semibold mb-2">Собранный контекст:</h3>
            {Object.keys(context).length === 0 ? (
              <p className="text-gray-500 text-sm">Контекст пока пуст</p>
            ) : (
              <pre className="bg-gray-50 p-4 rounded-lg text-sm overflow-x-auto">
                {JSON.stringify(context, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

