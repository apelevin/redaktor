'use client';

import { useState, useEffect } from 'react';
import { useDocumentStore } from '@/lib/store/document-store';
import type { Question, QuestionAnswer } from '@/types/question';
import QuestionRenderer from './questions/QuestionRenderer';
import CostDisplay from './CostDisplay';
import type { TokenUsage } from '@/lib/utils/cost-calculator';
import { mergeAnswerToContext } from '@/lib/utils/context-merge';

interface ChatMessage {
  id: string;
  type: 'question' | 'answer' | 'system';
  content: string | Question;
  timestamp: Date;
}

interface SkeletonChatPanelProps {
  selectedItems: Array<{ sectionId: string; itemIndex: number; sectionTitle: string; itemText: string }>;
  onAllItemsProcessed: () => void;
}

export default function SkeletonChatPanel({ selectedItems, onAllItemsProcessed }: SkeletonChatPanelProps) {
  const {
    documentType,
    generatedContext,
    skeleton,
    currentSkeletonItem,
    skeletonItemAnswers,
    documentMode,
    setCurrentSkeletonItem,
    addSkeletonItemAnswer,
    addCostRecord,
  } = useDocumentStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentQuestion, setCurrentQuestionState] = useState<Question | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [processedItems, setProcessedItems] = useState<Set<string>>(new Set());
  const [processingItemKey, setProcessingItemKey] = useState<string | null>(null);
  const [allItemsProcessed, setAllItemsProcessed] = useState(false);

  const addMessage = (type: ChatMessage['type'], content: string | Question) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        type,
        content,
        timestamp: new Date(),
      },
    ]);
  };

  // Проверка завершения обработки всех пунктов
  useEffect(() => {
    if (selectedItems.length === 0) return;
    
    // Проверяем, все ли выбранные пункты обработаны
    const allSelectedKeys = selectedItems.map(item => `${item.sectionId}-${item.itemIndex}`);
    const allProcessed = allSelectedKeys.every(key => processedItems.has(key));
    
    if (allProcessed && !allItemsProcessed && !isLoading && !currentQuestion) {
      console.log('All items processed, enabling button');
      setAllItemsProcessed(true);
      setCurrentSkeletonItem(null);
      setProcessingItemKey(null);
    }
  }, [processedItems.size, selectedItems.length, allItemsProcessed, isLoading, currentQuestion]);

  // Обработка следующего пункта
  useEffect(() => {
    if (selectedItems.length > 0 && currentItemIndex < selectedItems.length && !isLoading && !currentQuestion && !allItemsProcessed) {
      const item = selectedItems[currentItemIndex];
      const itemKey = `${item.sectionId}-${item.itemIndex}`;
      // Проверяем, что пункт еще не обработан
      if (!processedItems.has(itemKey)) {
        processNextItem();
      }
    }
  }, [currentItemIndex, selectedItems.length, isLoading, currentQuestion, allItemsProcessed]);

  const processNextItem = async () => {
    if (currentItemIndex >= selectedItems.length) {
      // Все пункты обработаны
      setCurrentSkeletonItem(null);
      setProcessingItemKey(null);
      setAllItemsProcessed(true);
      return;
    }

    const item = selectedItems[currentItemIndex];
    const itemKey = `${item.sectionId}-${item.itemIndex}`;

    // Пропускаем уже обработанные пункты
    if (processedItems.has(itemKey)) {
      if (currentItemIndex + 1 < selectedItems.length) {
        setCurrentItemIndex(currentItemIndex + 1);
      } else {
        setCurrentSkeletonItem(null);
        setProcessingItemKey(null);
        setAllItemsProcessed(true);
      }
      return;
    }

    // Защита от повторных вызовов для одного пункта
    if (processingItemKey === itemKey) {
      return; // Уже обрабатывается этот пункт
    }

    // Устанавливаем текущий пункт и флаг обработки
    setCurrentSkeletonItem({ sectionId: item.sectionId, itemIndex: item.itemIndex });
    setProcessingItemKey(itemKey);

    setIsLoading(true);

    try {
      const response = await fetch('/api/pipeline/skeleton-item-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_type: documentType,
          generated_context: generatedContext,
          section_title: item.sectionTitle,
          section_id: item.sectionId,
          item_text: item.itemText,
          item_index: item.itemIndex,
          existing_answers: skeletonItemAnswers,
          document_mode: documentMode,
        }),
      });

      const data = await response.json();

      // Отслеживаем затраты
      if (data.usage && data.model) {
        addCostRecord(data.model, data.usage as TokenUsage, 'question_generation');
      }

      if (data.question) {
        // Вопрос нужен - показываем его
        const question = data.question as Question;
        
        // Проверяем, не был ли этот вопрос уже добавлен в сообщения
        // Проверяем и по ID, и по тексту (первые 50 символов), чтобы избежать дублирования похожих вопросов
        const questionAlreadyInMessages = messages.some(
          msg => {
            if (msg.type === 'question' && typeof msg.content !== 'string') {
              // Проверка по ID
              if (msg.content.id === question.id) {
                return true;
              }
              // Проверка по тексту (первые 50 символов) - если очень похожи, считаем дубликатом
              const existingText = msg.content.text.substring(0, 50).toLowerCase().trim();
              const newText = question.text.substring(0, 50).toLowerCase().trim();
              if (existingText === newText || 
                  (existingText.length > 30 && newText.length > 30 && 
                   existingText.includes(newText.substring(0, 30)) || 
                   newText.includes(existingText.substring(0, 30)))) {
                return true;
              }
            }
            return false;
          }
        );
        
        if (!questionAlreadyInMessages) {
          setCurrentQuestionState(question);
          addMessage('question', question);
        } else {
          // Вопрос уже был задан (похожий), просто устанавливаем его как текущий
          // Находим уже существующий вопрос в messages
          const existingQuestion = messages.find(
            msg => msg.type === 'question' && typeof msg.content !== 'string' && 
            (msg.content.id === question.id || 
             msg.content.text.substring(0, 50).toLowerCase().trim() === question.text.substring(0, 50).toLowerCase().trim())
          );
          if (existingQuestion && typeof existingQuestion.content !== 'string') {
            setCurrentQuestionState(existingQuestion.content);
          } else {
            setCurrentQuestionState(question);
          }
        }
        setIsLoading(false);
      } else {
        // Вопрос не нужен - тихо пропускаем и переходим к следующему пункту
        markItemAsProcessed(itemKey);
        setCurrentSkeletonItem(null);
        setProcessingItemKey(null);
        setIsLoading(false);
        
        // Переходим к следующему пункту
        const nextIndex = currentItemIndex + 1;
        if (nextIndex < selectedItems.length) {
          // Используем setTimeout, чтобы дать React время обновить состояние
          setTimeout(() => {
            setCurrentItemIndex(nextIndex);
          }, 50);
        } else {
          // Все пункты обработаны
          setAllItemsProcessed(true);
        }
      }
    } catch (error) {
      console.error('Error processing skeleton item:', error);
      markItemAsProcessed(itemKey);
      setCurrentSkeletonItem(null);
      setProcessingItemKey(null);
      setIsLoading(false);
      
      // Переходим к следующему пункту после ошибки
      const nextIndex = currentItemIndex + 1;
      if (nextIndex < selectedItems.length) {
        setTimeout(() => {
          setCurrentItemIndex(nextIndex);
        }, 50);
      } else {
        setAllItemsProcessed(true);
      }
    }
  };

  const markItemAsProcessed = (itemKey: string) => {
    setProcessedItems((prev) => new Set([...prev, itemKey]));
  };

  const handleAnswerSubmit = async (
    rawAnswer: string | string[] | { option: string; details?: string },
    selectedOptionIds?: string[]
  ) => {
    if (!currentQuestion || !currentSkeletonItem) return;

    // Сохраняем ответ для текущего пункта
    addSkeletonItemAnswer(
      currentSkeletonItem.sectionId,
      currentSkeletonItem.itemIndex,
      {
        questionId: currentQuestion.id,
        raw: rawAnswer,
        selectedOptionIds,
      }
    );

    // Форматируем ответ для отображения в чате
    let answerText: string;
    if (typeof rawAnswer === 'object' && !Array.isArray(rawAnswer) && 'option' in rawAnswer) {
      answerText = rawAnswer.details 
        ? `${rawAnswer.option}: ${rawAnswer.details}`
        : rawAnswer.option;
    } else if (Array.isArray(rawAnswer)) {
      answerText = rawAnswer.join(', ');
    } else {
      answerText = rawAnswer;
    }

    addMessage('answer', answerText);

    // Помечаем текущий пункт как обработанный
    const itemKey = `${currentSkeletonItem.sectionId}-${currentSkeletonItem.itemIndex}`;
    markItemAsProcessed(itemKey);

    // Переходим к следующему пункту
    setCurrentQuestionState(null);
    setCurrentSkeletonItem(null);
    
    // Проверяем, все ли пункты обработаны (включая текущий)
    const nextIndex = currentItemIndex + 1;
    if (nextIndex >= selectedItems.length) {
      // Это был последний пункт
      console.log('Last item processed, enabling button');
      setAllItemsProcessed(true);
      setProcessingItemKey(null);
    } else {
      // Переходим к следующему пункту (useEffect вызовет processNextItem)
      setCurrentItemIndex(nextIndex);
    }
  };

  // Получаем информацию о текущем пункте для отображения
  const getCurrentItemInfo = () => {
    if (currentItemIndex >= selectedItems.length) return null;
    const item = selectedItems[currentItemIndex];
    return {
      ...item,
      current: currentItemIndex + 1,
      total: selectedItems.length,
    };
  };

  const currentItemInfo = getCurrentItemInfo();

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="p-4 border-b border-gray-200 bg-white">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">Уточняющие вопросы</h2>
            {currentItemInfo && (
              <div className="mt-2 text-sm text-gray-600">
                <span className="font-medium">Пункт {currentItemInfo.current} из {currentItemInfo.total}:</span>{' '}
                <span className="text-gray-800">{currentItemInfo.itemText}</span>
                <span className="ml-2 text-gray-500">({currentItemInfo.sectionTitle})</span>
              </div>
            )}
          </div>
          <CostDisplay />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.type === 'answer' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.type === 'answer'
                  ? 'bg-blue-600 text-white'
                  : message.type === 'question'
                  ? 'bg-white border border-gray-200'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {message.type === 'question' && typeof message.content !== 'string' ? (
                <div>
                  <p className="font-medium mb-2">{message.content.text}</p>
                  {message.content.options && (
                    <ul className="text-sm text-gray-600 list-disc list-inside">
                      {message.content.options.map((opt) => (
                        <li key={opt.id}>{opt.label}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p>{message.content}</p>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg p-3">
              <p className="text-gray-600">Загрузка...</p>
            </div>
          </div>
        )}
      </div>

      {currentQuestion && (
        <div className="p-4 border-t border-gray-200 bg-white">
          <div className="mb-2 text-sm font-medium text-gray-700">
            Ответьте на вопрос:
          </div>
          <QuestionRenderer
            question={currentQuestion}
            onSubmit={handleAnswerSubmit}
          />
        </div>
      )}

      <div className="p-4 border-t border-gray-200 bg-white">
        {allItemsProcessed && !currentQuestion && !isLoading && (
          <div className="mb-4">
            <p className="text-green-800 font-medium mb-2">
              ✓ Все вопросы по структуре документа отвечены
            </p>
            <p className="text-sm text-green-700 mb-4">
              Теперь вы можете перейти к генерации полного текста документа
            </p>
          </div>
        )}
        <button
          onClick={() => onAllItemsProcessed()}
          disabled={!allItemsProcessed || isLoading || !!currentQuestion}
          className={`w-full px-6 py-3 rounded-lg font-medium transition-colors ${
            allItemsProcessed && !isLoading && !currentQuestion
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          Перейти к генерации текста документа
        </button>
      </div>
    </div>
  );
}

