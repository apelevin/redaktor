'use client';

import { useDocumentStore } from '@/lib/store/document-store';
import DocumentPanel from './components/DocumentPanel';
import ChatPanel from './components/ChatPanel';
import Step2Panel from './components/Step2Panel';
import Step3Panel from './components/Step3Panel';

export default function Home() {
  const currentStep = useDocumentStore((state) => state.currentStep);

  if (currentStep === 'step2') {
    return <Step2Panel />;
  }

  if (currentStep === 'step3') {
    return <Step3Panel />;
  }

  return (
    <div className="h-screen flex">
      <div className="w-1/2">
        <DocumentPanel />
      </div>
      <div className="w-1/2">
        <ChatPanel />
      </div>
    </div>
  );
}
