'use client';

import { DialogueTurn } from '@/lib/types';

interface ChatHistoryProps {
  history: DialogueTurn[];
}

export default function ChatHistory({ history }: ChatHistoryProps) {
  if (history.length === 0) {
    return (
      <div style={{ 
        padding: '20px', 
        textAlign: 'center', 
        color: '#999',
        fontStyle: 'italic'
      }}>
        История диалога пуста. Начните общение с агентом.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
      {history.map((turn) => (
        <div
          key={turn.id}
          style={{
            display: 'flex',
            justifyContent: turn.role === 'user' ? 'flex-end' : 'flex-start',
          }}
        >
          <div
            style={{
              maxWidth: '80%',
              padding: '12px 16px',
              borderRadius: '12px',
              backgroundColor: turn.role === 'user' ? '#007bff' : '#e9ecef',
              color: turn.role === 'user' ? '#fff' : '#333',
            }}
          >
            <div style={{ 
              fontSize: '12px', 
              opacity: 0.7,
              marginBottom: '5px'
            }}>
              {turn.role === 'user' ? 'Вы' : 'Агент'}
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{turn.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
