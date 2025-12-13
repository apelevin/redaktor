'use client';

import type { Question } from '@/types/question';
import OpenQuestion from './OpenQuestion';
import SingleChoiceQuestion from './SingleChoiceQuestion';
import MultiChoiceQuestion from './MultiChoiceQuestion';

interface QuestionRendererProps {
  question: Question;
  onSubmit: (rawAnswer: string | string[] | { option: string; details?: string }, selectedOptionIds?: string[]) => void;
}

export default function QuestionRenderer({ question, onSubmit }: QuestionRendererProps) {
  const handleOpenSubmit = (answer: string) => {
    onSubmit(answer);
  };

  const handleSingleSubmit = (
    answer: string | { option: string; details?: string },
    selectedOptionIds: string[]
  ) => {
    onSubmit(answer, selectedOptionIds);
  };

  const handleMultiSubmit = (answer: string[], selectedOptionIds: string[]) => {
    onSubmit(answer, selectedOptionIds);
  };

  switch (question.uiKind) {
    case 'open':
      return <OpenQuestion question={question} onSubmit={handleOpenSubmit} />;
    
    case 'single':
      return <SingleChoiceQuestion question={question} onSubmit={handleSingleSubmit} />;
    
    case 'multi':
      return <MultiChoiceQuestion question={question} onSubmit={handleMultiSubmit} />;
    
    default:
      return <div>Неизвестный тип вопроса</div>;
  }
}

