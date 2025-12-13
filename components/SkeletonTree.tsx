'use client';

import { useState } from 'react';
import { SkeletonNode } from '@/lib/types';

interface SkeletonTreeProps {
  node: SkeletonNode;
  level?: number;
}

export default function SkeletonTree({ node, level = 0 }: SkeletonTreeProps) {
  const [expanded, setExpanded] = useState<boolean>(level < 2); // По умолчанию раскрыты первые 2 уровня
  
  const hasChildren = node.children && node.children.length > 0;
  const indent = level * 20;
  
  const kindColors: Record<string, string> = {
    document: '#2563eb',
    section: '#059669',
    clause: '#dc2626',
    appendix: '#7c3aed',
  };
  
  const kindLabels: Record<string, string> = {
    document: 'Документ',
    section: 'Раздел',
    clause: 'Пункт',
    appendix: 'Приложение',
  };
  
  return (
    <div style={{ marginLeft: `${indent}px`, marginBottom: '8px' }}>
      <div
        style={{
          padding: '10px',
          border: '1px solid #ddd',
          borderRadius: '6px',
          backgroundColor: '#fff',
          cursor: hasChildren ? 'pointer' : 'default',
        }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {hasChildren && (
            <span style={{ fontSize: '12px', color: '#666' }}>
              {expanded ? '▼' : '▶'}
            </span>
          )}
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: kindColors[node.kind] || '#999',
              color: '#fff',
              fontSize: '11px',
              fontWeight: 'bold',
            }}
          >
            {kindLabels[node.kind] || node.kind}
          </span>
          <strong style={{ flex: 1 }}>{node.title}</strong>
          <span style={{ fontSize: '11px', color: '#666' }}>
            {node.node_id}
          </span>
        </div>
        
        {node.purpose && (
          <div style={{ marginTop: '5px', fontSize: '13px', color: '#555', fontStyle: 'italic' }}>
            {node.purpose}
          </div>
        )}
        
        {node.tags && node.tags.length > 0 && (
          <div style={{ marginTop: '5px', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {node.tags.map((tag, idx) => (
              <span
                key={idx}
                style={{
                  padding: '2px 6px',
                  borderRadius: '3px',
                  backgroundColor: '#e5e7eb',
                  color: '#374151',
                  fontSize: '11px',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        
        {(node.requires || node.include_if) && (
          <div style={{ marginTop: '5px', fontSize: '11px', color: '#666' }}>
            {node.requires && node.requires.length > 0 && (
              <div>
                <strong>Requires:</strong> {node.requires.join(', ')}
              </div>
            )}
            {node.include_if && node.include_if.length > 0 && (
              <div>
                <strong>Include if:</strong> {node.include_if.join(', ')}
              </div>
            )}
          </div>
        )}
      </div>
      
      {hasChildren && expanded && (
        <div style={{ marginTop: '5px' }}>
          {node.children.map((child, idx) => (
            <SkeletonTree key={child.node_id || idx} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
