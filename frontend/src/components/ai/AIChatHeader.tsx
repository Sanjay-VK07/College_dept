'use client';

import React from 'react';
import { Bot, Sparkles, Minus, PlusCircle } from 'lucide-react';

interface AIChatHeaderProps {
  onClose: () => void;
  onNewChat: () => void;
}

export const AIChatHeader: React.FC<AIChatHeaderProps> = ({ onClose, onNewChat }) => {
  return (
    <div className="bg-[#1E40AF] text-white p-4 rounded-t-xl flex items-center justify-between shadow-md">
      <div className="flex items-center space-x-3">
        <div className="w-9 h-9 rounded-lg bg-blue-600 border border-blue-400/40 flex items-center justify-center relative">
          <Bot className="w-5 h-5 text-white" />
          <Sparkles className="w-3 h-3 text-amber-300 absolute -top-1 -right-1" />
        </div>
        <div>
          <h3 className="font-semibold text-base leading-snug tracking-tight">AI Academic Assistant</h3>
          <p className="text-xs text-blue-100 font-normal">GATE Exam & Portal Assistant</p>
        </div>
      </div>

      <div className="flex items-center space-x-1">
        <button
          onClick={onNewChat}
          title="Start New Conversation"
          className="p-1.5 hover:bg-blue-700/80 rounded-md text-blue-100 hover:text-white transition-colors"
        >
          <PlusCircle className="w-4 h-4" />
        </button>
        <button
          onClick={onClose}
          title="Minimize Chat"
          className="p-1.5 hover:bg-blue-700/80 rounded-md text-blue-100 hover:text-white transition-colors"
        >
          <Minus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
