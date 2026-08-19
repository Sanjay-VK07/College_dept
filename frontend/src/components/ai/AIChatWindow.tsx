'use client';

import React, { useRef, useEffect } from 'react';
import { AIChatHeader } from './AIChatHeader';
import { AIQuickActions } from './AIQuickActions';
import { AIChatMessage } from './AIChatMessage';
import { AIChatInput } from './AIChatInput';
import { AIMessage } from '@/services/aiService';
import { Bot, Loader2 } from 'lucide-react';

interface AIChatWindowProps {
  role?: string;
  messages: AIMessage[];
  isLoading: boolean;
  onSendMessage: (text: string) => void;
  onClose: () => void;
  onNewChat: () => void;
}

export const AIChatWindow: React.FC<AIChatWindowProps> = ({
  role = 'STUDENT',
  messages,
  isLoading,
  onSendMessage,
  onClose,
  onNewChat,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 h-[500px] bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col transition-all duration-200 animate-in fade-in slide-in-from-bottom-5">
      {/* Header */}
      <AIChatHeader onClose={onClose} onNewChat={onNewChat} />

      {/* Quick Actions Bar */}
      <AIQuickActions role={role} onSelectAction={onSendMessage} />

      {/* Messages Scroll Area */}
      <div className="flex-1 p-3 overflow-y-auto bg-slate-50/50 flex flex-col space-y-1">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-2">
              <Bot className="w-6 h-6" />
            </div>
            <h4 className="font-semibold text-slate-800 text-sm">Welcome to AI Assistant</h4>
            <p className="text-xs text-slate-500 mt-1">
              Ask any question about GATE syllabus, virtual calculator, exam schedules, or portal navigation.
            </p>
          </div>
        ) : (
          messages.map((msg) => <AIChatMessage key={msg.id} message={msg} />)
        )}

        {/* Loading / Typing Indicator */}
        {isLoading && (
          <div className="flex items-center space-x-2 my-2 text-slate-500 bg-white border border-slate-200 rounded-xl p-2.5 max-w-[70%] text-xs shadow-2xs">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            <span>AI Assistant is thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <AIChatInput onSendMessage={onSendMessage} isLoading={isLoading} />
    </div>
  );
};
