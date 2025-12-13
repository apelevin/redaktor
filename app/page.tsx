'use client';

import { useState, useEffect } from 'react';
import ResultPane from '@/components/ResultPane';
import ChatPane from '@/components/ChatPane';
import { PreSkeletonState, NextAction } from '@/lib/types';

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<PreSkeletonState | null>(null);
  const [nextAction, setNextAction] = useState<NextAction | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingSkeleton, setIsGeneratingSkeleton] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Создаем сессию при загрузке
  useEffect(() => {
    async function createInitialSession() {
      try {
        const response = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        if (!response.ok) {
          throw new Error('Failed to create session');
        }

        const data = await response.json();
        setSessionId(data.session_id);
        setState(data.state);
        setNextAction(data.next_action);
      } catch (error) {
        console.error('Error creating session:', error);
      }
    }

    createInitialSession();
  }, []);

  const handleSendMessage = async (message: string) => {
    if (!sessionId || isLoading) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/session/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();
      setState(data.state);
      setNextAction(data.next_action);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnswerQuestion = async (answer: string) => {
    if (!sessionId || !nextAction || nextAction.kind !== 'ask_user') return;

    await handleSendMessage(answer);
  };

  const handleGenerateSkeleton = async () => {
    if (!sessionId || isGeneratingSkeleton) return;

    setIsGeneratingSkeleton(true);
    try {
      const response = await fetch(`/api/session/${sessionId}/skeleton`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Failed to generate skeleton');
      }

      const data = await response.json();
      setState(data.state);
      setNextAction(data.next_action);
    } catch (error) {
      console.error('Error generating skeleton:', error);
    } finally {
      setIsGeneratingSkeleton(false);
    }
  };

  const handleStartReview = async () => {
    if (!sessionId) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/session/${sessionId}/review/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Failed to start review');
      }

      const data = await response.json();
      setState(data.state);
      setNextAction(data.next_action);
    } catch (error) {
      console.error('Error starting review:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitReviewAnswers = async (answers: any[]) => {
    if (!sessionId || isSubmittingReview) {
      console.warn('Cannot submit review answers: sessionId missing or already submitting');
      return;
    }

    if (!answers || answers.length === 0) {
      console.warn('No answers to submit');
      return;
    }

    setIsSubmittingReview(true);
    try {
      const response = await fetch(`/api/session/${sessionId}/review/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || errorData.error || `Failed to apply review answers: ${response.status}`;
        
        // Если review уже frozen, это нормально - просто обновляем state
        if (errorData.error === 'Review is already frozen' || errorMessage.includes('frozen')) {
          // Обновляем state, чтобы получить актуальное состояние
          const getResponse = await fetch(`/api/session/${sessionId}`);
          if (getResponse.ok) {
            const getData = await getResponse.json();
            setState(getData.state);
            setNextAction(getData.next_action);
            return;
          }
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setState(data.state);
      setNextAction(data.next_action);
    } catch (error) {
      console.error('Error submitting review answers:', error);
      // Можно показать пользователю сообщение об ошибке
    } finally {
      setIsSubmittingReview(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Левая панель - 2/3 экрана */}
      <div style={{ width: '66.66%', overflow: 'auto', borderRight: '1px solid #ddd' }}>
        <ResultPane 
          state={state} 
          onGenerateSkeleton={handleGenerateSkeleton}
          isGeneratingSkeleton={isGeneratingSkeleton}
          onStartReview={handleStartReview}
          onSubmitReviewAnswers={handleSubmitReviewAnswers}
          isSubmittingReview={isSubmittingReview}
        />
      </div>

      {/* Правая панель - 1/3 экрана */}
      <div style={{ width: '33.33%', display: 'flex', flexDirection: 'column' }}>
        <ChatPane
          state={state}
          nextAction={nextAction}
          onSendMessage={handleSendMessage}
          onAnswerQuestion={handleAnswerQuestion}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
