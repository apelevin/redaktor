'use client';

import { useState } from 'react';
import { SkeletonNode } from '@/lib/types';

interface SkeletonTreeProps {
  node: SkeletonNode;
  level?: number;
}

export default function SkeletonTree({ node, level = 0 }: SkeletonTreeProps) {
  const [expanded, setExpanded] = useState<boolean>(level < 2); // По умолчанию раскрыты первые 2 уровня
  
  // Если узел имеет выбранный вариант, используем children из варианта
  const effectiveChildren = (() => {
    if (node.selected_variant_id && node.variants && node.variants.length > 0) {
      const selectedVariant = node.variants.find(v => v.variant_id === node.selected_variant_id);
      if (selectedVariant && selectedVariant.children && selectedVariant.children.length > 0) {
        return selectedVariant.children;
      }
    }
    return node.children;
  })();
  
  const hasChildren = effectiveChildren && effectiveChildren.length > 0;
  const indent = level * 20;
  const isOmitted = node.status === 'omitted';
  const isActive = node.status === 'active' || !node.status; // По умолчанию active
  
  // Фильтруем children: показываем только активные узлы или omitted с пометкой
  const visibleChildren = effectiveChildren?.filter(child => 
    child.status !== 'omitted' || level === 0 // Показываем omitted только на верхнем уровне для видимости
  ) || [];
  
  // Отладочная информация (можно убрать позже)
  if (level === 0 && node.kind === 'document') {
    console.log('[SkeletonTree] Document root:', {
      node_id: node.node_id,
      title: node.title,
      hasVariants: !!node.variants,
      variantsCount: node.variants?.length || 0,
      selectedVariant: node.selected_variant_id,
      childrenCount: node.children?.length || 0,
      effectiveChildrenCount: effectiveChildren?.length || 0,
      visibleChildrenCount: visibleChildren.length,
      hasChildren,
    });
  }
  
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
  
  // Если узел omitted и не на верхнем уровне, не показываем его
  if (isOmitted && level > 0) {
    return null;
  }
  
  return (
    <div style={{ marginLeft: `${indent}px`, marginBottom: '8px' }}>
      <div
        style={{
          padding: '10px',
          border: '1px solid #ddd',
          borderRadius: '6px',
          backgroundColor: isOmitted ? '#f3f4f6' : '#fff',
          opacity: isOmitted ? 0.6 : 1,
          cursor: hasChildren ? 'pointer' : 'default',
          minHeight: '50px', // Минимальная высота для видимости
        }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {hasChildren ? (
            <span style={{ fontSize: '12px', color: '#666', minWidth: '15px' }}>
              {expanded ? '▼' : '▶'}
            </span>
          ) : (
            <span style={{ fontSize: '12px', color: '#ccc', minWidth: '15px' }}>-</span>
          )}
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: kindColors[node.kind] || '#999',
              color: '#fff',
              fontSize: '11px',
              fontWeight: 'bold',
              whiteSpace: 'nowrap',
            }}
          >
            {kindLabels[node.kind] || node.kind}
          </span>
          <strong style={{ 
            flex: 1, 
            textDecoration: isOmitted ? 'line-through' : 'none',
            minWidth: '150px', // Минимальная ширина для видимости
          }}>
            {node.title || node.node_id || 'Без названия'}
          </strong>
          {isOmitted && (
            <span style={{ 
              fontSize: '10px', 
              color: '#dc2626', 
              marginLeft: '5px',
              padding: '2px 6px',
              backgroundColor: '#fee2e2',
              borderRadius: '3px'
            }}>
              ИСКЛЮЧЕН
            </span>
          )}
          {node.selected_variant_id && (
            <span style={{ 
              fontSize: '10px', 
              color: '#059669', 
              marginLeft: '5px',
              padding: '2px 6px',
              backgroundColor: '#d1fae5',
              borderRadius: '3px'
            }}>
              Вариант: {node.selected_variant_id}
            </span>
          )}
          <span style={{ fontSize: '11px', color: '#666', marginLeft: '5px' }}>
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
          {visibleChildren.length > 0 ? (
            visibleChildren.map((child, idx) => (
              <SkeletonTree key={child.node_id || idx} node={child} level={level + 1} />
            ))
          ) : (
            <div style={{ 
              marginLeft: '20px', 
              padding: '10px', 
              backgroundColor: '#fef3c7', 
              borderRadius: '4px',
              fontSize: '12px',
              color: '#92400e'
            }}>
              ⚠️ Все дочерние узлы исключены (omitted). Проверьте структуру.
            </div>
          )}
          {effectiveChildren && effectiveChildren.length > visibleChildren.length && (
            <div style={{ 
              marginLeft: '20px', 
              padding: '5px', 
              fontSize: '12px', 
              color: '#999',
              fontStyle: 'italic'
            }}>
              ... и еще {effectiveChildren.length - visibleChildren.length} исключенных узлов
            </div>
          )}
        </div>
      )}
      
      {/* Показываем сообщение, если узел должен иметь children, но их нет */}
      {!hasChildren && node.kind !== 'clause' && level === 0 && (
        <div style={{ 
          marginTop: '10px', 
          padding: '15px', 
          backgroundColor: '#fee2e2', 
          borderRadius: '6px',
          fontSize: '13px',
          color: '#991b1b',
          border: '1px solid #fca5a5'
        }}>
          <strong>⚠️ Проблема:</strong> Корневой узел документа не содержит дочерних элементов.
          {node.variants && node.variants.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              Доступно {node.variants.length} вариантов структуры. Выберите вариант через review.
            </div>
          )}
        </div>
      )}
      
      {/* Показываем информацию о вариантах, если они есть, но не выбраны */}
      {node.variants && node.variants.length > 0 && !node.selected_variant_id && (
        <div style={{ 
          marginTop: '5px', 
          padding: '8px', 
          backgroundColor: '#f0f9ff', 
          borderRadius: '4px',
          fontSize: '11px',
          color: '#1e40af'
        }}>
          ℹ️ Доступно {node.variants.length} вариантов структуры. Выберите вариант через review.
        </div>
      )}
    </div>
  );
}
