'use client';

import type { Section } from '@/types/document';

interface SkeletonViewProps {
  skeleton: Section[];
  onEdit?: (sectionId: string, updates: Partial<Section>) => void;
}

export default function SkeletonView({ skeleton, onEdit }: SkeletonViewProps) {
  const renderSection = (section: Section, level: number = 0) => {
    const indent = level * 20;
    
    return (
      <div key={section.id} className="mb-2" style={{ marginLeft: `${indent}px` }}>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-700">
            {section.title}
          </span>
          <span className="text-xs text-gray-400">({section.id})</span>
        </div>
        {section.subsections && section.subsections.length > 0 && (
          <div className="mt-1">
            {section.subsections.map(sub => renderSection(sub, level + 1))}
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <h3 className="text-lg font-bold mb-4">Структура документа</h3>
      <div className="space-y-2">
        {skeleton.map(section => renderSection(section))}
      </div>
    </div>
  );
}

