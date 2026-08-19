'use client';

import React, { useState, useRef, KeyboardEvent } from 'react';
import { Send, Loader2 } from 'lucide-react';

interface AIChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
}

export const AIChatInput: React.FC<AIChatInputProps> = ({ onSendMessage, isLoading }) => {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (text.trim() && !isLoading) {
      onSendMessage(text.trim());
      setText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-3 bg-white border-t border-slate-200 rounded-b-xl flex items-center space-x-2">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask about GATE, exams, subjects, results or the portal..."
        disabled={isLoading}
        rows={1}
        className="flex-1 bg-slate-50 border border-slate-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none resize-none max-h-24 disabled:opacity-60"
      />
      <button
        onClick={handleSend}
        disabled={!text.trim() || isLoading}
        className="bg-[#1E40AF] hover:bg-[#1D4ED8] disabled:bg-slate-300 text-white p-2 rounded-lg transition-colors flex items-center justify-center cursor-pointer disabled:cursor-not-allowed"
      >
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
      </button>
    </div>
  );
};
