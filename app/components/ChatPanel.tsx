'use client';

import { useState, useEffect, useRef } from 'react';
import { useDocumentStore } from '@/lib/pipeline/state';
import { formatCost, calculateCost } from '@/lib/utils/cost-calculator';
import type { TokenUsage } from '@/lib/utils/cost-calculator';

type PipelineStage = 
  | 'initial'
  | 'collecting_context'
  | 'generating_skeleton'
  | 'generating_clauses'
  | 'complete';

interface Message {
  id: string;
  type: 'question' | 'answer' | 'system';
  content: string;
  timestamp: Date;
}

export default function ChatPanel() {
  const {
    document_type,
    jurisdiction,
    style,
    qa_context,
    skeleton,
    clauses,
    cost_records,
    setDocumentType,
    setJurisdiction,
    setStyle,
    addQAContext,
    setSkeleton,
    addClause,
    addCostRecord,
    reset,
  } = useDocumentStore();
  
  // Функция для обработки данных об использовании токенов
  const handleUsageData = (usage: TokenUsage | undefined, model: string | undefined, step: string) => {
    if (usage && model) {
      const cost = calculateCost(model, usage);
      addCostRecord(step, model, usage, cost);
      console.log(`Cost added for ${step}:`, { model, usage, cost: cost.totalCost });
    }
  };
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [stage, setStage] = useState<PipelineStage>('initial');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  const addMessage = (type: Message['type'], content: string) => {
    setMessages(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      content,
      timestamp: new Date(),
    }]);
  };
  
  const startNewDocument = async () => {
    reset();
    setMessages([]);
    setCurrentQuestion(null);
    setAnswer('');
    setStage('initial');
    
    const docType = prompt('Введите тип документа (например: договор поставки, подряд, NDA):');
    if (!docType) return;
    
    setDocumentType(docType);
    addMessage('system', `Начинаем создание документа: ${docType}`);
    
    // Проверяем инструкцию
    setLoading(true);
    try {
      const instructionRes = await fetch('/api/pipeline/instruction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_type: docType,
          style,
        }),
      });
      
      if (!instructionRes.ok) {
        const errorData = await instructionRes.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${instructionRes.status}`);
      }
      
      const instruction = await instructionRes.json();
      
      if (instruction.instruction_found && instruction.skeleton) {
        setSkeleton(instruction.skeleton);
        addMessage('system', 'Найдена инструкция. Используем готовую структуру.');
        setStage('generating_clauses');
        // Переходим к генерации клауз
        await generateClausesForSkeleton(instruction.skeleton);
      } else {
        // Начинаем сбор контекста
        setStage('collecting_context');
        await askNextQuestion(docType);
      }
    } catch (error) {
      console.error('Error starting document:', error);
      addMessage('system', 'Ошибка при инициализации документа');
    } finally {
      setLoading(false);
    }
  };
  
  const askNextQuestion = async (docType?: string) => {
    const currentDocType = docType || document_type;
    
    if (!currentDocType) {
      addMessage('system', 'Ошибка: тип документа не указан');
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch('/api/pipeline/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_type: currentDocType,
          jurisdiction,
          style,
          qa_context: qa_context || [],
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }
      
      const data = await res.json();
      
      // Обрабатываем данные об использовании токенов
      if (data.usage && data.model) {
        handleUsageData(data.usage, data.model, 'question_generation');
      }
      if (data.completion_usage && data.completion_model) {
        handleUsageData(data.completion_usage, data.completion_model, 'context_completion');
      }
      
      if (data.is_complete) {
        addMessage('system', 'Контекст собран. Генерируем структуру документа...');
        await generateSkeleton();
      } else if (data.question) {
        setCurrentQuestion(data.question);
        addMessage('question', data.question);
      }
    } catch (error) {
      console.error('Error asking question:', error);
      const errorMessage = error instanceof Error ? error.message : 'Ошибка при генерации вопроса';
      addMessage('system', `Ошибка: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };
  
  const handleAnswerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim() || !currentQuestion) return;
    
    addMessage('answer', answer);
    addQAContext({ question: currentQuestion, answer });
    setAnswer('');
    setCurrentQuestion(null);
    
    // Проверяем, нужен ли еще вопрос
    setLoading(true);
    try {
      const res = await fetch('/api/pipeline/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_type,
          jurisdiction,
          style,
          qa_context: [...(qa_context || []), { question: currentQuestion, answer }],
          action: 'check_completion',
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }
      
      const data = await res.json();
      
      // Обрабатываем данные об использовании токенов
      if (data.usage && data.model) {
        handleUsageData(data.usage, data.model, 'context_completion');
      }
      
      if (data.is_complete) {
        addMessage('system', 'Контекст собран. Генерируем структуру документа...');
        await generateSkeleton();
      } else {
        await askNextQuestion();
      }
    } catch (error) {
      console.error('Error checking completion:', error);
      const errorMessage = error instanceof Error ? error.message : 'Ошибка при проверке';
      addMessage('system', `Ошибка: ${errorMessage}`);
      // Пытаемся продолжить с следующим вопросом
      try {
        await askNextQuestion();
      } catch {
        setLoading(false);
      }
    } finally {
      setLoading(false);
    }
  };
  
  const generateSkeleton = async () => {
    setStage('generating_skeleton');
    setLoading(true);
    
    try {
      const res = await fetch('/api/pipeline/skeleton', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_type,
          qa_context: qa_context || [],
          jurisdiction,
          style,
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }
      
      const data = await res.json();
      
      // Обрабатываем данные об использовании токенов
      if (data.usage && data.model) {
        handleUsageData(data.usage, data.model, 'skeleton_generation');
      }
      
      if (data.skeleton) {
        setSkeleton(data.skeleton);
        addMessage('system', 'Структура документа создана. Генерируем пункты...');
        setStage('generating_clauses');
        await generateClausesForSkeleton(data.skeleton);
      }
    } catch (error) {
      console.error('Error generating skeleton:', error);
      const errorMessage = error instanceof Error ? error.message : 'Ошибка при генерации структуры';
      addMessage('system', `Ошибка: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };
  
  const generateClausesForSkeleton = async (skeletonToProcess: typeof skeleton) => {
    setLoading(true);
    
    // Рекурсивная функция для обхода skeleton
    const processSection = async (section: typeof skeleton[0]) => {
      addMessage('system', `Генерируем пункт: ${section.title}...`);
      
      try {
        const res = await fetch('/api/pipeline/clause', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            document_type,
            current_section: section.id,
            qa_context: qa_context || [],
            jurisdiction,
            style,
            clauses_summary: useDocumentStore.getState().clauses_summary,
            contract_variables: useDocumentStore.getState().contract_variables,
          }),
        });
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `HTTP ${res.status}`);
        }
        
        const data = await res.json();
        
        // Обрабатываем данные об использовании токенов (только для LLM, не для RAG)
        if (data.source === 'llm' && data.usage && data.model) {
          handleUsageData(data.usage, data.model, 'clause_generation');
        }
        
        if (data.clause) {
          addClause(data.clause);
          
          // Добавляем summary
          const summary = `${section.title}: ${data.clause.content.substring(0, 100)}...`;
          useDocumentStore.getState().addClauseSummary(summary);
          
          addMessage('system', `✓ Пункт "${section.title}" создан (${data.source})`);
        }
      } catch (error) {
        console.error(`Error generating clause for ${section.id}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Ошибка при создании пункта';
        addMessage('system', `Ошибка при создании пункта "${section.title}": ${errorMessage}`);
      }
      
      // Обрабатываем подразделы
      if (section.subsections) {
        for (const subsection of section.subsections) {
          await processSection(subsection);
        }
      }
    };
    
    // Обрабатываем все разделы
    for (const section of skeletonToProcess) {
      await processSection(section);
    }
    
    setStage('complete');
    addMessage('system', '✓ Документ создан! Вы можете редактировать его в левой панели.');
    setLoading(false);
  };
  
  // Вычисляем общую стоимость из cost_records
  const totalCost = useDocumentStore((state) => {
    const records = state.cost_records;
    const total = records.reduce((sum, record) => sum + record.cost.totalCost, 0);
    return total;
  });
  
  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-bold">Чат</h2>
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
              <span className="text-xs text-gray-600 mr-1">Стоимость:</span>
              <span className="text-base font-bold text-green-700">{formatCost(totalCost)}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={startNewDocument}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Новый документ
          </button>
          {stage !== 'initial' && (
            <button
              onClick={reset}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
            >
              Сбросить
            </button>
          )}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-20">
            <p>Нажмите "Новый документ" чтобы начать</p>
          </div>
        )}
        
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${
              msg.type === 'answer' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                msg.type === 'question'
                  ? 'bg-blue-100 text-blue-900'
                  : msg.type === 'answer'
                  ? 'bg-green-100 text-green-900'
                  : 'bg-gray-200 text-gray-700 text-sm'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-200 rounded-lg p-3 text-sm text-gray-600">
              Обработка...
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      {currentQuestion && (
        <form onSubmit={handleAnswerSubmit} className="p-4 border-t border-gray-200 bg-white">
          <div className="mb-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ваш ответ:
            </label>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded resize-none"
              rows={3}
              placeholder="Введите ваш ответ..."
            />
          </div>
          <button
            type="submit"
            disabled={!answer.trim() || loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Отправить
          </button>
        </form>
      )}
    </div>
  );
}

