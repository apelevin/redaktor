'use client';

import { useState, useEffect } from 'react';
import { useDocumentStore } from '@/lib/store/document-store';
import type { Question, QuestionAnswer } from '@/types/question';
import QuestionRenderer from './questions/QuestionRenderer';
import CompletionChoice from './CompletionChoice';
import { mergeAnswerToContext } from '@/lib/utils/context-merge';
import { calcCompletionState, decideNextStep, isQuestionAnswered } from '@/lib/utils/question-completion';
import type { CompletionMessage } from '@/types/completion';
import CostDisplay from './CostDisplay';
import type { TokenUsage } from '@/lib/utils/cost-calculator';

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
    questions,
    currentQuestionId,
    completionState,
    nextStep,
    setDocumentType,
    addAnswer,
    setCurrentQuestion,
    addQuestion,
    updateContext,
    setCompletionState,
    setNextStep,
    addCostRecord,
    setCurrentStep,
  } = useDocumentStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentQuestion, setCurrentQuestionState] = useState<Question | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [newDocumentType, setNewDocumentType] = useState('');
  const [completionMessage, setCompletionMessage] = useState<CompletionMessage | null>(null);

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

      // Отслеживаем затраты
      if (data.usage && data.model) {
        addCostRecord(data.model, data.usage as TokenUsage, 'question_generation');
      }

      if (data.question) {
        const question = data.question as Question;
        // Проверяем, не был ли этот вопрос уже задан
        const questionAlreadyExists = questions.find(q => q.id === question.id);
        if (!questionAlreadyExists) {
          addQuestion(question);
        }
        setCurrentQuestionState(question);
        setCurrentQuestion(question.id);
        addMessage('question', question);
        
        // Инициализируем состояние заполненности
        const allQuestionsForState = questionAlreadyExists ? questions : [...questions, question];
        const initialContext = {};
        const initialCompletionState = calcCompletionState(allQuestionsForState, initialContext);
        setCompletionState(initialCompletionState);
        const initialStep = decideNextStep(initialCompletionState, allQuestionsForState, initialContext);
        setNextStep(initialStep);
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

    // Пересчитываем состояние заполненности
    // Убеждаемся, что currentQuestion не дублируется в списке
    const allQuestions = currentQuestion && !questions.find(q => q.id === currentQuestion.id)
      ? [...questions, currentQuestion].filter(Boolean) as Question[]
      : questions.filter(Boolean) as Question[];
    const newCompletionState = calcCompletionState(allQuestions, newContext);
    setCompletionState(newCompletionState);

    // Всегда сначала пытаемся запросить следующий вопрос через API
    // Это гарантирует, что мы получим все вопросы, которые нужно задать
    try {
      const answeredQuestionIds = allQuestions
        .filter(q => isQuestionAnswered(q, newContext))
        .map(q => q.id);

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

      // Отслеживаем затраты
      if (data.usage && data.model) {
        addCostRecord(data.model, data.usage as TokenUsage, 'question_generation');
      }

      if (data.question) {
        // Получили новый вопрос от API - показываем его
        const question = data.question as Question;
        
        // Проверяем, не был ли этот вопрос уже отвечен
        const isAlreadyAnswered = isQuestionAnswered(question, newContext);
        if (isAlreadyAnswered) {
          // Если вопрос уже отвечен, не показываем его снова
          // Продолжаем запрашивать следующий вопрос (но ограничим количество попыток)
          let attempts = 0;
          let foundUnansweredQuestion = false;
          
          while (attempts < 5 && !foundUnansweredQuestion) {
            attempts++;
            const answeredQuestionIds = allQuestions
              .filter(q => isQuestionAnswered(q, newContext))
              .map(q => q.id);
            
            const nextResponse = await fetch('/api/questions/next', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                documentType: documentType || '',
                context: newContext,
                answeredQuestionIds,
              }),
            });
            
            const nextData = await nextResponse.json();
            
            // Отслеживаем затраты
            if (nextData.usage && nextData.model) {
              addCostRecord(nextData.model, nextData.usage as TokenUsage, 'question_generation');
            }
            
            if (nextData.question) {
              const nextQuestion = nextData.question as Question;
              const nextIsAlreadyAnswered = isQuestionAnswered(nextQuestion, newContext);
              if (!nextIsAlreadyAnswered) {
                // Нашли неотвеченный вопрос - обрабатываем его
                const nextQuestionAlreadyExists = allQuestions.find(q => q.id === nextQuestion.id);
                if (!nextQuestionAlreadyExists) {
                  addQuestion(nextQuestion);
                }
                
                const nextQuestionAlreadyInMessages = messages.some(
                  msg => msg.type === 'question' && typeof msg.content !== 'string' && msg.content.id === nextQuestion.id
                );
                
                if (!nextQuestionAlreadyInMessages) {
                  setCurrentQuestionState(nextQuestion);
                  setCurrentQuestion(nextQuestion.id);
                  addMessage('question', nextQuestion);
                } else {
                  setCurrentQuestionState(nextQuestion);
                  setCurrentQuestion(nextQuestion.id);
                }
                foundUnansweredQuestion = true;
                setIsLoading(false);
                return;
              }
              // Если следующий вопрос тоже уже отвечен, продолжаем цикл
            } else {
              // API вернул null - нет больше вопросов, переходим к проверке завершенности
              foundUnansweredQuestion = true; // Выходим из цикла
            }
          }
          
          // Если не нашли неотвеченный вопрос после нескольких попыток, переходим к проверке завершенности
          setIsLoading(false);
          // Продолжаем выполнение кода ниже для проверки завершенности
        } else {
          // Вопрос еще не отвечен - показываем его
          // Проверяем, не был ли этот вопрос уже задан
          const questionAlreadyExists = allQuestions.find(q => q.id === question.id);
          if (!questionAlreadyExists) {
            addQuestion(question);
          }
          
          // Проверяем, не был ли этот вопрос уже добавлен в сообщения
          const questionAlreadyInMessages = messages.some(
            msg => msg.type === 'question' && typeof msg.content !== 'string' && msg.content.id === question.id
          );
          
          if (!questionAlreadyInMessages) {
            setCurrentQuestionState(question);
            setCurrentQuestion(question.id);
            addMessage('question', question);
          } else {
            // Вопрос уже был задан, просто устанавливаем его как текущий
            setCurrentQuestionState(question);
            setCurrentQuestion(question.id);
          }
          
          setIsLoading(false);
          return;
        }
      }
    } catch (error) {
      console.error('Error getting next question:', error);
    }

    // Если API вернул null (нет больше вопросов), проверяем recommended вопросы
    // Пересчитываем состояние заполненности с учетом всех вопросов
    const finalAllQuestions = questions.filter(Boolean) as Question[];
    const finalCompletionState = calcCompletionState(finalAllQuestions, newContext);
    setCompletionState(finalCompletionState);

    // Определяем следующий шаг для recommended вопросов
    const step = decideNextStep(finalCompletionState, finalAllQuestions, newContext);
    setNextStep(step);

    // Если must завершены и есть recommended, генерируем мета-сообщение
    if (finalCompletionState.mustCompleted && step.kind === 'askMore' && step.questions.length > 0) {
      try {
        const remainingRecommended = step.questions;
        
        const response = await fetch('/api/completion-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state: finalCompletionState,
            remainingRecommended,
          }),
        });

        const result = await response.json();
        
        // Отслеживаем затраты
        if (result.usage && result.model) {
          addCostRecord(result.model, result.usage as TokenUsage, 'completion_message');
        }
        
        setCompletionMessage(result.message);
        addMessage('system', result.message.message);
        setCurrentQuestionState(null);
        setCurrentQuestion(null);
      } catch (error) {
        console.error('Error generating completion message:', error);
      }
    } else if (step.kind === 'generateContract') {
      // Все вопросы заданы (и API вернул null, и нет recommended)
      setCompletionMessage(null);
      addMessage('system', 'Все вопросы заданы. Контекст достаточен для генерации документа.');
      setCurrentQuestionState(null);
      setCurrentQuestion(null);
    } else {
      // Неожиданная ситуация
      setCurrentQuestionState(null);
      setCurrentQuestion(null);
    }

    setIsLoading(false);
  };

  const handleGenerateContract = () => {
    addMessage('system', 'Начинаем генерацию договора...');
    // TODO: Здесь будет логика генерации договора
  };

  const handleContinueQuestions = (questionsToAsk: Question[]) => {
    setCompletionMessage(null);
    if (questionsToAsk.length > 0) {
      const nextQ = questionsToAsk[0];
      setCurrentQuestionState(nextQ);
      setCurrentQuestion(nextQ.id);
      addMessage('question', nextQ);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="p-4 border-b border-gray-200 bg-white">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-2xl font-bold">Чат</h2>
          <CostDisplay />
        </div>
        
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

      {completionMessage && nextStep?.kind === 'askMore' && nextStep.questions.length > 0 && (
        <div className="p-4 border-t border-gray-200 bg-white">
          <CompletionChoice
            message={completionMessage}
            onGenerate={handleGenerateContract}
            onContinue={handleContinueQuestions}
            questions={nextStep.questions}
          />
        </div>
      )}

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

      {/* Кнопка перехода к шагу 2 - всегда видна и всегда активна */}
      {documentType && (
        <div className="p-4 border-t border-gray-200 bg-white">
          <button
            onClick={() => setCurrentStep('step2')}
            className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors"
          >
            Шаг 2: Генерация контекста договора →
          </button>
        </div>
      )}
    </div>
  );
}
