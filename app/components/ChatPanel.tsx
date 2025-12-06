'use client';

import { useState, useEffect } from 'react';
import { useDocumentStore } from '@/lib/store/document-store';
import type { Question, QuestionAnswer } from '@/types/question';
import QuestionRenderer from './questions/QuestionRenderer';
import { mergeAnswerToContext } from '@/lib/utils/context-merge';

interface ChatMessage {
  id: string;
  type: 'question' | 'answer' | 'system';
  content: string | Question;
  timestamp: Date;
}

export default function ChatPanel() {
  const {
    documentType,
    context,
    answers,
    currentQuestionId,
    setDocumentType,
    addAnswer,
    setCurrentQuestion,
    updateContext,
  } = useDocumentStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentQuestion, setCurrentQuestionState] = useState<Question | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [newDocumentType, setNewDocumentType] = useState('');

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

  const startNewDocument = async (type: string) => {
    if (!type.trim()) return;

    setDocumentType(type);
    setMessages([]);
    setCurrentQuestionState(null);
    setIsLoading(true);

    addMessage('system', `Начинаем создание документа типа: ${type}`);

    try {
      const response = await fetch('/api/questions/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentType: type,
          context: {},
          answeredQuestionIds: [],
        }),
      });

      const data = await response.json();

      if (data.question) {
        setCurrentQuestionState(data.question);
        setCurrentQuestion(data.question.id);
        addMessage('question', data.question);
      } else {
        addMessage('system', 'Контекст достаточен для генерации документа');
      }
    } catch (error) {
      console.error('Error starting document:', error);
      addMessage('system', 'Ошибка при инициализации документа');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnswerSubmit = async (
    rawAnswer: string | string[] | { option: string; details?: string },
    selectedOptionIds?: string[]
  ) => {
    if (!currentQuestion) return;

    setIsLoading(true);

    // Сохраняем ответ пользователя
    const answer: QuestionAnswer = {
      questionId: currentQuestion.id,
      raw: rawAnswer,
      selectedOptionIds,
      normalized: {},
    };

    addAnswer(answer);
    
    // Форматируем ответ для отображения в чате
    let answerText: string;
    if (typeof rawAnswer === 'object' && !Array.isArray(rawAnswer) && 'option' in rawAnswer) {
      // Условный ответ с деталями
      answerText = rawAnswer.details 
        ? `${rawAnswer.option}: ${rawAnswer.details}`
        : rawAnswer.option;
    } else if (Array.isArray(rawAnswer)) {
      answerText = rawAnswer.join(', ');
    } else {
      answerText = rawAnswer;
    }
    
    addMessage('answer', answerText);

    // Мерджим ответ в контекст
    const newContext = mergeAnswerToContext(context, answer, currentQuestion);
    updateContext(newContext);

    // Запрашиваем следующий вопрос
    try {
      const answeredQuestionIds = [...answers.map(a => a.questionId), currentQuestion.id];

      const response = await fetch('/api/questions/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentType: documentType || '',
          context: newContext,
          answeredQuestionIds,
        }),
      });

      const data = await response.json();

      if (data.question) {
        setCurrentQuestionState(data.question);
        setCurrentQuestion(data.question.id);
        addMessage('question', data.question);
      } else {
        setCurrentQuestionState(null);
        setCurrentQuestion(null);
        addMessage('system', 'Все вопросы заданы. Контекст достаточен для генерации документа.');
      }
    } catch (error) {
      console.error('Error getting next question:', error);
      addMessage('system', 'Ошибка при получении следующего вопроса');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="p-4 border-b border-gray-200 bg-white">
        <h2 className="text-2xl font-bold mb-4">Чат</h2>
        
        {!documentType ? (
          <div className="space-y-2">
            <input
              type="text"
              value={newDocumentType}
              onChange={(e) => setNewDocumentType(e.target.value)}
              placeholder="Введите тип документа (например: service_contract)"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => startNewDocument(newDocumentType)}
              disabled={!newDocumentType.trim() || isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Начать создание документа
            </button>
          </div>
        ) : (
          <div className="text-sm text-gray-600">
            Тип документа: <span className="font-semibold">{documentType}</span>
          </div>
        )}
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
    </div>
  );
}
