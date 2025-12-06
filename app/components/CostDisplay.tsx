'use client';

import { useState } from 'react';
import { useDocumentStore, useTotalCost } from '@/lib/store/document-store';
import { formatCost } from '@/lib/utils/cost-calculator';

export default function CostDisplay() {
  const totalCost = useTotalCost();
  const costRecords = useDocumentStore((state) => state.costRecords);
  const [isOpen, setIsOpen] = useState(false);

  if (costRecords.length === 0) {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-xs text-gray-600 hover:text-gray-800 transition-colors cursor-pointer"
      >
        <span className="font-medium">Затраты:</span>{' '}
        <span className="text-blue-600 font-semibold">{formatCost(totalCost)}</span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Затраты на OpenAI API</h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <div className="mt-2">
                <div className="text-3xl font-bold text-blue-600">{formatCost(totalCost)}</div>
                <div className="text-sm text-gray-500 mt-1">
                  {costRecords.length} {costRecords.length === 1 ? 'запрос' : 'запросов'}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Детализация затрат</h3>
              <div className="space-y-2">
                {costRecords.slice().reverse().map((record) => (
                  <div
                    key={record.id}
                    className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900 capitalize">
                        {record.operation.replace('_', ' ')}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(record.timestamp).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-gray-900">
                        {formatCost(record.cost)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {record.model}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
