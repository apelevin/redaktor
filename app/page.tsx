import DocumentPanel from './components/DocumentPanel';
import ChatPanel from './components/ChatPanel';

export default function Home() {
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
