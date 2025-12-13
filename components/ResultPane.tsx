'use client';

import { PreSkeletonState } from '@/lib/types';
import StateMeta from './StateMeta';
import DomainView from './DomainView';
import IssuesList from './IssuesList';

interface ResultPaneProps {
  state: PreSkeletonState | null;
}

export default function ResultPane({ state }: ResultPaneProps) {
  if (!state) {
    return (
      <div style={{ padding: '20px' }}>
        <p>Загрузка состояния...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', height: '100%', overflow: 'auto' }}>
      <h1 style={{ marginBottom: '20px' }}>Contract IR Draft</h1>
      
      <StateMeta meta={state.meta} gate={state.gate} />
      
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
