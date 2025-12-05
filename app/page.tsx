'use client';

import DocumentEditor from './components/DocumentEditor';
import ChatPanel from './components/ChatPanel';

export default function Home() {
  return (
    <main className="h-screen flex">
      <div className="flex-1 border-r border-gray-300">
        <DocumentEditor />
      </div>
      <div className="w-96 flex-shrink-0">
        <ChatPanel />
      </div>
    </main>
  );
}

