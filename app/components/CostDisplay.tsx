'use client';

import { useDocumentStore } from '@/lib/store/document-store';
import { formatCost } from '@/lib/utils/cost-calculator';

export default function CostDisplay() {
  const totalCost = useDocumentStore((state) => state.totalCost);
  const costRecords = useDocumentStore((state) => state.costRecords);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-gray-700">
            Затраты на OpenAI API
          </div>
          <div className="text-2xl font-bold text-blue-600 mt-1">
            {formatCost(totalCost)}
          </div>
        </div>
        {costRecords.length > 0 && (
          <div className="text-xs text-gray-500">
            {costRecords.length} {costRecords.length === 1 ? 'запрос' : 'запросов'}
          </div>
        )}
      </div>
      {costRecords.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="text-xs text-gray-600 space-y-1 max-h-32 overflow-y-auto">
            {costRecords.slice(-5).reverse().map((record) => (
              <div key={record.id} className="flex justify-between">
                <span className="capitalize">{record.operation.replace('_', ' ')}</span>
                <span className="font-medium">{formatCost(record.cost)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

