'use client';

import { PreSkeletonState } from '@/lib/types';
import StateMeta from './StateMeta';
import DomainView from './DomainView';
import IssuesList from './IssuesList';
import SkeletonTree from './SkeletonTree';

interface ResultPaneProps {
  state: PreSkeletonState | null;
  onGenerateSkeleton?: () => void;
  isGeneratingSkeleton?: boolean;
}

export default function ResultPane({ 
  state, 
  onGenerateSkeleton,
  isGeneratingSkeleton = false 
}: ResultPaneProps) {
  if (!state) {
    return (
      <div style={{ padding: '20px' }}>
        <p>Загрузка состояния...</p>
      </div>
    );
  }

  const canGenerateSkeleton = 
    state.meta.stage === 'pre_skeleton' &&
    state.gate?.ready_for_skeleton === true &&
    !state.document?.skeleton;

  const hasSkeleton = !!state.document?.skeleton;

  return (
    <div style={{ padding: '20px', height: '100%', overflow: 'auto' }}>
      <h1 style={{ marginBottom: '20px' }}>Contract IR Draft</h1>
      
      <StateMeta 
        meta={state.meta} 
        gate={state.gate} 
        skeletonMeta={state.document?.skeleton_meta}
      />
      
      {canGenerateSkeleton && onGenerateSkeleton && (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#e7f3ff', borderRadius: '8px' }}>
          <div style={{ marginBottom: '10px' }}>
            <strong>Готов к генерации skeleton</strong>
          </div>
          <button
            onClick={onGenerateSkeleton}
            disabled={isGeneratingSkeleton}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              fontWeight: 'bold',
              backgroundColor: isGeneratingSkeleton ? '#ccc' : '#007bff',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: isGeneratingSkeleton ? 'not-allowed' : 'pointer',
            }}
          >
            {isGeneratingSkeleton ? 'Генерация...' : 'Generate Skeleton'}
          </button>
        </div>
      )}
      
      {hasSkeleton && (
        <div style={{ marginTop: '30px' }}>
          <h2>Skeleton (Структура договора)</h2>
          {state.document.skeleton_meta && (
            <div style={{ 
              marginBottom: '15px', 
              padding: '10px', 
              backgroundColor: '#f0f9ff', 
              borderRadius: '6px',
              fontSize: '13px',
              color: '#666'
            }}>
              <div><strong>Узлов:</strong> {state.document.skeleton_meta.node_count}</div>
              <div><strong>Сгенерирован:</strong> {new Date(state.document.skeleton_meta.generated_at).toLocaleString('ru-RU')}</div>
              <div><strong>Версия схемы:</strong> {state.document.skeleton_meta.schema_version}</div>
            </div>
          )}
          <SkeletonTree node={state.document.skeleton.root} />
        </div>
      )}
      
      <div style={{ marginTop: '30px' }}>
        <h2>Domain (Доменные данные)</h2>
        <DomainView domain={state.domain} />
      </div>
      
      <div style={{ marginTop: '30px' }}>
        <h2>Issues (Проблемы)</h2>
        <IssuesList issues={state.issues} />
      </div>
    </div>
  );
}
