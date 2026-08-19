'use client';

import React from 'react';
import { Bot, User } from 'lucide-react';
import { AIMessage } from '@/services/aiService';

interface AIChatMessageProps {
  message: AIMessage;
}

export const AIChatMessage: React.FC<AIChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'USER';

  // Basic renderer for bullet lists, bold text, and lines
  const renderFormattedContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, idx) => {
      if (line.startsWith('### ')) {
        return <h4 key={idx} className="font-semibold text-sm mt-2 mb-1 text-slate-900">{line.replace('### ', '')}</h4>;
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return (
          <li key={idx} className="ml-4 list-disc text-xs sm:text-sm my-0.5">
            {line.substring(2)}
          </li>
        );
      }
      if (line.trim() === '') {
        return <div key={idx} className="h-1.5" />;
      }
      return (
        <p key={idx} className="text-xs sm:text-sm leading-relaxed my-0.5">
          {line}
        </p>
      );
    });
  };

  return (
    <div className={`flex w-full my-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[85%] ${isUser ? 'flex-row-reverse space-x-reverse space-x-2' : 'flex-row space-x-2'}`}>
        {/* Avatar */}
        <div
          className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs mt-0.5 ${
            isUser ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700 border border-slate-300'
          }`}
        >
          {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4 text-blue-700" />}
        </div>

        {/* Message Content Bubble */}
        <div
          className={`p-3 rounded-xl text-xs sm:text-sm shadow-sm ${
            isUser
              ? 'bg-[#1E40AF] text-white rounded-tr-none'
              : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
          }`}
        >
          {renderFormattedContent(message.content)}
          <div
            className={`text-[10px] mt-1 text-right ${
              isUser ? 'text-blue-200' : 'text-slate-400'
            }`}
          >
            {message.createdAt
              ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : ''}
          </div>
        </div>
      </div>
    </div>
  );
};
