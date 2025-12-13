'use client';

import { Issue } from '@/lib/types';
import { useState } from 'react';

interface IssuesListProps {
  issues: Issue[];
}

export default function IssuesList({ issues }: IssuesListProps) {
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved' | 'dismissed'>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'high' | 'med' | 'low'>('all');

  const filteredIssues = issues.filter((issue) => {
    if (filter !== 'all' && issue.status !== filter) return false;
    if (severityFilter !== 'all' && issue.severity !== severityFilter) return false;
    return true;
  });

  const severityColors: Record<string, string> = {
    critical: '#dc143c',
    high: '#ff6347',
    med: '#ffa500',
    low: '#32cd32',
  };

  const statusColors: Record<string, string> = {
    open: '#dc143c',
    resolved: '#32cd32',
    dismissed: '#999',
  };

  return (
    <div>
      <div style={{ marginBottom: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <div>
          <label>
            Status:{' '}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              style={{ padding: '5px' }}
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </label>
        </div>
        <div>
          <label>
            Severity:{' '}
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as any)}
              style={{ padding: '5px' }}
            >
              <option value="all">All</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="med">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
        </div>
        <div>
          <strong>Total: {filteredIssues.length}</strong>
        </div>
      </div>

      {filteredIssues.length === 0 ? (
        <div style={{ padding: '20px', color: '#999', fontStyle: 'italic' }}>
          Нет issues, соответствующих фильтрам.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filteredIssues.map((issue) => (
            <div
              key={issue.id}
              style={{
                padding: '15px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                backgroundColor: '#fff',
              }}
            >
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    backgroundColor: severityColors[issue.severity] || '#999',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 'bold',
                  }}
                >
                  {issue.severity.toUpperCase()}
                </span>
                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    backgroundColor: statusColors[issue.status] || '#999',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                >
                  {issue.status}
                </span>
                <strong>{issue.title}</strong>
              </div>
              
              <div style={{ marginTop: '8px', color: '#666' }}>
                <div><strong>Почему важно:</strong> {issue.why_it_matters}</div>
                {issue.missing_or_conflict && (
                  <div style={{ marginTop: '5px' }}>
                    <strong>Проблема:</strong> {issue.missing_or_conflict}
                  </div>
                )}
                <div style={{ marginTop: '5px' }}>
                  <strong>Как решить:</strong> {issue.resolution_hint}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
