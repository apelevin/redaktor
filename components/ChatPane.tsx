'use client';

import { useState, useEffect, useRef } from 'react';
import { PreSkeletonState, NextAction } from '@/lib/types';
import ChatHistory from './ChatHistory';
import QuestionForm from './QuestionForm';
import ChatInput from './ChatInput';

interface ChatPaneProps {
  state: PreSkeletonState | null;
  nextAction: NextAction | null;
  onSendMessage: (message: string) => Promise<void>;
  onAnswerQuestion: (answer: string) => Promise<void>;
  isLoading: boolean;
}

export default function ChatPane({
  state,
  nextAction,
  onSendMessage,
  onAnswerQuestion,
  isLoading,
}: ChatPaneProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state?.dialogue.history]);

  const handleSubmit = (answer: string) => {
    if (nextAction?.kind === 'ask_user') {
      onAnswerQuestion(answer);
    } else {
      onSendMessage(answer);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%',
      backgroundColor: '#f5f5f5'
    }}>
      <div style={{ 
        padding: '15px', 
        borderBottom: '1px solid #ddd',
        backgroundColor: '#fff'
      }}>
        <h2>Чат с агентом</h2>
      </div>

      <div style={{ 
        flex: 1, 
        overflow: 'auto', 
        padding: '15px',
        backgroundColor: '#fff'
      }}>
        <ChatHistory history={state?.dialogue.history || []} />
        <div ref={messagesEndRef} />
      </div>

      <div style={{ 
        borderTop: '1px solid #ddd',
        padding: '15px',
        backgroundColor: '#fff'
      }}>
        {nextAction?.kind === 'ask_user' && (
          <QuestionForm
            question={nextAction.ask_user}
            onSubmit={handleSubmit}
            isLoading={isLoading}
          />
        )}
        
        {nextAction?.kind === 'proceed_to_skeleton' && (
          <div style={{ 
            padding: '15px', 
            backgroundColor: '#d4edda', 
            borderRadius: '8px',
            color: '#155724'
          }}>
            ✅ Готово к генерации skeleton! Все необходимые данные собраны.
          </div>
        )}
        
        {nextAction?.kind === 'halt_error' && (
          <div style={{ 
            padding: '15px', 
            backgroundColor: '#f8d7da', 
            borderRadius: '8px',
            color: '#721c24'
          }}>
            ❌ Ошибка: {nextAction.error.message}
            {nextAction.error.suggested_recovery && (
              <div style={{ marginTop: '10px' }}>
                <strong>Рекомендация:</strong> {nextAction.error.suggested_recovery}
              </div>
            )}
          </div>
        )}
        
        {nextAction?.kind !== 'ask_user' && 
         nextAction?.kind !== 'proceed_to_skeleton' && 
         nextAction?.kind !== 'halt_error' && (
          <ChatInput
            onSend={handleSubmit}
            isLoading={isLoading}
            placeholder="Введите сообщение..."
          />
        )}
      </div>
    </div>
  );
}
