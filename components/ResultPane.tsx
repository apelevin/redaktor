'use client';

import { PreSkeletonState } from '@/lib/types';
import StateMeta from './StateMeta';
import DomainView from './DomainView';
import IssuesList from './IssuesList';
import SkeletonTree from './SkeletonTree';
import ReviewQuestionsPanel from './ReviewQuestionsPanel';

interface ResultPaneProps {
  state: PreSkeletonState | null;
  onGenerateSkeleton?: () => void;
  isGeneratingSkeleton?: boolean;
  onStartReview?: () => void;
  onSubmitReviewAnswers?: (answers: any[]) => void;
  isSubmittingReview?: boolean;
}

export default function ResultPane({ 
  state, 
  onGenerateSkeleton,
  isGeneratingSkeleton = false,
  onStartReview,
  onSubmitReviewAnswers,
  isSubmittingReview = false,
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
  const hasSkeletonFinal = !!state.document?.skeleton_final;
  // Приоритет: skeleton_final (после review) > skeleton (после генерации)
  const displaySkeleton = hasSkeletonFinal ? state.document.skeleton_final : state.document?.skeleton;
  const hasReviewQuestions = state.review?.questions && state.review.questions.length > 0;
  const isReviewStage = state.meta.stage === 'skeleton_review' || state.meta.stage === 'skeleton_ready';
  const canStartReview = isReviewStage && hasSkeleton && !hasReviewQuestions && onStartReview;
  
  // Отладочная информация (можно убрать позже)
  if (displaySkeleton) {
    if (!displaySkeleton.root) {
      console.warn('[ResultPane] displaySkeleton exists but root is missing:', displaySkeleton);
    } else {
      console.log('[ResultPane] Displaying skeleton:', {
        hasRoot: !!displaySkeleton.root,
        rootTitle: displaySkeleton.root.title,
        rootChildrenCount: displaySkeleton.root.children?.length || 0,
        hasVariants: !!displaySkeleton.root.variants,
        selectedVariant: displaySkeleton.root.selected_variant_id,
        isSkeletonFinal: hasSkeletonFinal,
      });
    }
  }

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
      
      {canStartReview && (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#e7f3ff', borderRadius: '8px' }}>
          <div style={{ marginBottom: '10px' }}>
            <strong>Готов к настройке структуры</strong>
          </div>
          <button
            onClick={onStartReview}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              fontWeight: 'bold',
              backgroundColor: '#007bff',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Начать настройку структуры
          </button>
        </div>
      )}

      {hasReviewQuestions && state.review && state.review.status !== 'frozen' && (
        <div style={{ marginTop: '30px' }}>
          <ReviewQuestionsPanel
            questions={state.review.questions}
            answers={state.review.answers || []}
            onSubmit={onSubmitReviewAnswers || (() => {})}
            isSubmitting={isSubmittingReview}
          />
        </div>
      )}
      
      {state.review?.status === 'frozen' && (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#d1fae5', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 10px 0' }}>✓ Настройка структуры завершена</h3>
          <p style={{ margin: 0, fontSize: '14px', color: '#065f46' }}>
            Структура договора зафиксирована. Теперь можно переходить к генерации текста пунктов.
          </p>
        </div>
      )}

      {/* Отображаем структуру skeleton - всегда, если она есть */}
      {displaySkeleton && displaySkeleton.root && (
        <div style={{ marginTop: '30px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '15px' }}>
            Skeleton (Структура договора)
            {hasSkeletonFinal && (
              <span style={{ fontSize: '14px', fontWeight: 'normal', color: '#666', marginLeft: '10px' }}>
                (Финальная версия после настройки)
              </span>
            )}
          </h2>
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
          {state.document.freeze?.structure && (
            <div style={{ 
              marginBottom: '15px', 
              padding: '10px', 
              backgroundColor: '#d1fae5', 
              borderRadius: '6px',
              fontSize: '13px',
              color: '#065f46'
            }}>
              <strong>✓ Структура зафиксирована</strong> (нельзя добавлять новые разделы/пункты)
            </div>
          )}
          {hasSkeletonFinal && (
            <div style={{ 
              marginBottom: '15px', 
              padding: '10px', 
              backgroundColor: '#fff7ed', 
              borderRadius: '6px',
              fontSize: '13px',
              color: '#92400e'
            }}>
              <strong>📋 Отображается финальная структура</strong> (после настройки через review)
            </div>
          )}
          <SkeletonTree node={displaySkeleton.root} />
        </div>
      )}
      
      <div style={{ marginTop: '30px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
          Domain (Доменные данные)
        </h2>
        <DomainView domain={state.domain} />
      </div>
      
      <div style={{ marginTop: '30px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
          Issues (Проблемы)
        </h2>
        <IssuesList issues={state.issues} />
      </div>
    </div>
  );
}
