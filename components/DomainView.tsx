'use client';

import { useState } from 'react';

interface DomainViewProps {
  domain: Record<string, unknown>;
}

export default function DomainView({ domain }: DomainViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpanded(newExpanded);
  };

  const renderValue = (value: unknown, key: string, path: string): React.ReactNode => {
    if (value === null || value === undefined) {
      return <span style={{ color: '#999' }}>null</span>;
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      const isExpanded = expanded.has(path);
      
      return (
        <div>
          <button
            onClick={() => toggle(path)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 5px',
              marginRight: '5px',
            }}
          >
            {isExpanded ? '▼' : '▶'}
          </button>
          <span style={{ fontWeight: 'bold' }}>{key}:</span>
          {isExpanded && (
            <div style={{ marginLeft: '20px', marginTop: '5px' }}>
              {Object.entries(obj).map(([k, v]) => (
                <div key={k} style={{ marginBottom: '5px' }}>
                  {renderValue(v, k, `${path}.${k}`)}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (Array.isArray(value)) {
      const isExpanded = expanded.has(path);
      
      return (
        <div>
          <button
            onClick={() => toggle(path)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 5px',
              marginRight: '5px',
            }}
          >
            {isExpanded ? '▼' : '▶'}
          </button>
          <span style={{ fontWeight: 'bold' }}>{key}:</span> [{value.length}]
          {isExpanded && (
            <div style={{ marginLeft: '20px', marginTop: '5px' }}>
              {value.map((item, idx) => (
                <div key={idx} style={{ marginBottom: '5px' }}>
                  {renderValue(item, `[${idx}]`, `${path}[${idx}]`)}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <span>
        <span style={{ fontWeight: 'bold' }}>{key}:</span>{' '}
        <span style={{ color: typeof value === 'string' ? '#0066cc' : '#cc6600' }}>
          {String(value)}
        </span>
      </span>
    );
  };

  if (Object.keys(domain).length === 0) {
    return (
      <div style={{ padding: '20px', color: '#999', fontStyle: 'italic' }}>
        Domain пуст. Информация будет собираться в процессе диалога.
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '15px', 
      border: '1px solid #ddd', 
      borderRadius: '8px',
      backgroundColor: '#f9f9f9',
      fontFamily: 'monospace',
      fontSize: '14px'
    }}>
      {Object.entries(domain).map(([key, value]) => (
        <div key={key} style={{ marginBottom: '10px' }}>
          {renderValue(value, key, key)}
        </div>
      ))}
    </div>
  );
}
