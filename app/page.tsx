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

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Левая панель - 2/3 экрана */}
      <div style={{ width: '66.66%', overflow: 'auto', borderRight: '1px solid #ddd' }}>
        <ResultPane state={state} />
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
