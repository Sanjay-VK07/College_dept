'use client';

import React from 'react';
import { Bot, Sparkles, X } from 'lucide-react';

interface AIChatButtonProps {
  isOpen: boolean;
  onToggle: () => void;
  hasUnread?: boolean;
}

export const AIChatButton: React.FC<AIChatButtonProps> = ({ isOpen, onToggle, hasUnread }) => {
  return (
    <button
      onClick={onToggle}
      aria-label="Toggle AI Academic Assistant"
      className="fixed bottom-6 right-6 z-[999] flex items-center justify-center w-14 h-14 bg-[#1E40AF] hover:bg-[#1D4ED8] text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-300 group cursor-pointer"
    >
      {isOpen ? (
        <X className="w-6 h-6 transition-transform duration-200 group-hover:rotate-90" />
      ) : (
        <div className="relative flex items-center justify-center">
          <Bot className="w-7 h-7" />
          <Sparkles className="w-4 h-4 text-amber-300 absolute -top-1 -right-1 animate-pulse" />
          {hasUnread && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
          )}
        </div>
      )}
    </button>
  );
};
