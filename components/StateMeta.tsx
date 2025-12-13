'use client';

import type { StateMeta, Gate } from '@/lib/types';

interface StateMetaProps {
  meta: StateMeta;
  gate?: Gate;
}

export default function StateMeta({ meta, gate }: StateMetaProps) {
  const statusColors: Record<string, string> = {
    collecting: '#ffa500',
    gating: '#4169e1',
    ready: '#32cd32',
    blocked: '#dc143c',
  };

  return (
    <div style={{ 
      padding: '15px', 
      border: '1px solid #ddd', 
      borderRadius: '8px',
      backgroundColor: '#f9f9f9'
    }}>
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        <div>
          <strong>Session ID:</strong> {meta.session_id.substring(0, 8)}...
        </div>
        <div>
          <strong>Status:</strong>{' '}
          <span style={{ 
            color: statusColors[meta.status] || '#333',
            fontWeight: 'bold'
          }}>
            {meta.status}
          </span>
        </div>
        <div>
          <strong>Version:</strong> {meta.state_version || 0}
        </div>
        <div>
          <strong>Stage:</strong> {meta.stage}
        </div>
      </div>
      
      {gate && (
        <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#fff', borderRadius: '4px' }}>
          <div>
            <strong>Gate Status:</strong>{' '}
            <span style={{ 
              color: gate.ready_for_skeleton ? '#32cd32' : '#dc143c',
              fontWeight: 'bold'
            }}>
              {gate.ready_for_skeleton ? 'Ready' : 'Not Ready'}
            </span>
          </div>
          <div style={{ marginTop: '5px' }}>
            <strong>Summary:</strong> {gate.summary}
          </div>
          {gate.blockers && gate.blockers.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <strong>Blockers:</strong>
              <ul style={{ marginLeft: '20px', marginTop: '5px' }}>
                {gate.blockers.map((blocker, idx) => (
                  <li key={idx} style={{ color: blocker.severity === 'critical' ? '#dc143c' : '#ffa500' }}>
                    [{blocker.severity}] {blocker.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
