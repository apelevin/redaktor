'use client';

import { useDocumentStore } from '@/lib/pipeline/state';
import SkeletonView from './SkeletonView';
import ClauseView from './ClauseView';
import { assembleDocument, formatDocumentForDisplay } from '@/lib/utils/document-assembler';
import { useEffect, useState } from 'react';

export default function DocumentEditor() {
  const {
    document_type,
    style,
    skeleton,
    clauses,
    qa_context,
    contract_variables,
    clauses_summary,
    updateClause,
  } = useDocumentStore();
  
  const [formattedText, setFormattedText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  useEffect(() => {
    if (skeleton.length > 0) {
      const state = useDocumentStore.getState();
      const assembled = assembleDocument(state);
      const formatted = formatDocumentForDisplay(assembled);
      setFormattedText(formatted);
    }
  }, [skeleton, clauses]);
  
  const handleClauseEdit = (clauseId: string, content: string) => {
    updateClause(clauseId, { content });
  };
  
  const handleSaveDocument = async () => {
    if (!document_type || skeleton.length === 0 || clauses.length === 0) {
      setSaveMessage({ type: 'error', text: 'Документ не готов к сохранению' });
      return;
    }
    
    setSaving(true);
    setSaveMessage(null);
    
    try {
      const state = useDocumentStore.getState();
      
      const response = await fetch('/api/pipeline/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const result = await response.json();
      setSaveMessage({ 
        type: 'success', 
        text: `Документ сохранен! Инструкция и ${result.clauses_saved} клауз добавлены в базу знаний.` 
      });
      
      // Очищаем сообщение через 5 секунд
      setTimeout(() => setSaveMessage(null), 5000);
    } catch (error) {
      console.error('Error saving document:', error);
      const errorMessage = error instanceof Error ? error.message : 'Ошибка при сохранении';
      setSaveMessage({ type: 'error', text: errorMessage });
    } finally {
      setSaving(false);
    }
  };
  
  const isDocumentReady = document_type && skeleton.length > 0 && clauses.length > 0;
  
  return (
    <div className="h-full flex flex-col bg-white">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Документ</h2>
          <button
            onClick={handleSaveDocument}
            disabled={!isDocumentReady || saving}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Сохранение...' : 'Сохранить документ'}
          </button>
        </div>
        {saveMessage && (
          <div className={`mt-2 p-2 rounded text-sm ${
            saveMessage.type === 'success' 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}>
            {saveMessage.text}
          </div>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto p-6">
        {skeleton.length === 0 ? (
          <div className="text-center text-gray-500 mt-20">
            <p>Начните создание документа, ответив на вопросы в чате</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Показываем skeleton для навигации */}
            <SkeletonView skeleton={skeleton} />
            
            {/* Показываем клаузы по разделам */}
            {skeleton.map((section) => {
              const sectionClauses = clauses.filter(c => c.sectionId === section.id);
              
              return (
                <div key={section.id} className="border-b border-gray-200 pb-4">
                  <h3 className="text-lg font-semibold mb-3">{section.title}</h3>
                  
                  {sectionClauses.length > 0 ? (
                    sectionClauses.map(clause => (
                      <ClauseView
                        key={clause.id}
                        clause={clause}
                        onEdit={handleClauseEdit}
                      />
                    ))
                  ) : (
                    <div className="text-gray-400 text-sm italic">
                      Пункт еще не создан
                    </div>
                  )}
                </div>
              );
            })}
            
            {/* Полный текст документа */}
            {formattedText && (
              <div className="mt-8 p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold mb-2">Полный текст документа:</h3>
                <pre className="whitespace-pre-wrap text-sm text-gray-700">
                  {formattedText}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

