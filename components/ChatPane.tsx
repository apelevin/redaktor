"use client";

import React from "react";
import type { ChatMessage, UserQuestion, UserAnswer } from "@/lib/types";
import ChatInput from "./ChatInput";
import QuestionForm from "./QuestionForm";

interface ChatPaneProps {
  messages: ChatMessage[];
  pendingQuestion?: UserQuestion;
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  onAnswerQuestion: (answer: UserAnswer) => void;
}

export default function ChatPane({
  messages,
  pendingQuestion,
  isLoading,
  onSendMessage,
  onAnswerQuestion,
}: ChatPaneProps) {
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingQuestion]);

  return (
    <div className="chat-pane">
      <div className="chat-header">
        <h2>Чат с агентом</h2>
      </div>

      <div className="chat-messages">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`chat-message ${message.role === "user" ? "user" : "assistant"}`}
          >
            <div className="message-content">{message.content}</div>
            <div className="message-timestamp">
              {new Date(message.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="chat-message assistant loading">
            <div className="message-content">
              <span className="loading-dots">Агент думает</span>
            </div>
          </div>
        )}

        {pendingQuestion && (
          <div className="chat-message assistant question">
            <QuestionForm
              question={pendingQuestion}
              onSubmit={onAnswerQuestion}
            />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {!pendingQuestion && (
        <div className="chat-input-container">
          <ChatInput
            onSend={onSendMessage}
            disabled={isLoading}
            placeholder="Опишите задачу для агента..."
          />
        </div>
      )}
    </div>
  );
}

