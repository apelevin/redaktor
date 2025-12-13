'use client';

import { useState } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  placeholder?: string;
}

export default function ChatInput({ onSend, isLoading, placeholder }: ChatInputProps) {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !isLoading) {
      onSend(message.trim());
      setMessage('');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', gap: '10px' }}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={placeholder || 'Введите сообщение...'}
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '12px',
            fontSize: '14px',
            border: '1px solid #ddd',
            borderRadius: '8px',
          }}
        />
        <button
          type="submit"
          disabled={isLoading || !message.trim()}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: 'bold',
            backgroundColor: isLoading || !message.trim() ? '#ccc' : '#007bff',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: isLoading || !message.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {isLoading ? '...' : 'Отправить'}
        </button>
      </div>
    </form>
  );
}
