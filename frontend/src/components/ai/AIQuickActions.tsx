'use client';

import React from 'react';
import { HelpCircle, Calendar, BarChart2, BookOpen, Settings, FileSpreadsheet } from 'lucide-react';

interface AIQuickActionsProps {
  role?: string;
  onSelectAction: (prompt: string) => void;
}

export const AIQuickActions: React.FC<AIQuickActionsProps> = ({ role = 'STUDENT', onSelectAction }) => {
  const getActions = () => {
    switch (role.toUpperCase()) {
      case 'FACULTY':
        return [
          { label: 'Examination Help', prompt: 'How do I create and publish an exam in the portal?', icon: HelpCircle },
          { label: 'Question Bank Help', prompt: 'Explain the question bank structure and CSV import format.', icon: BookOpen },
          { label: 'Student Performance Help', prompt: 'How can I view student results and invigilation logs?', icon: BarChart2 },
        ];
      case 'ADMIN':
        return [
          { label: 'Export Student Data', prompt: 'Export students to Excel', icon: FileSpreadsheet },
          { label: 'System Overview', prompt: 'Give me an overview of system health and metrics.', icon: BarChart2 },
          { label: 'Exam Management Help', prompt: 'What administrative options are available for mock tests?', icon: Settings },
          { label: 'Portal Administration Help', prompt: 'How are domain settings and user roles managed?', icon: HelpCircle },
        ];
      case 'STUDENT':
      default:
        return [
          { label: 'My Upcoming Exams', prompt: 'When is my next assigned exam?', icon: Calendar },
          { label: 'Explain My Results', prompt: 'How can I review solutions for completed exams?', icon: BarChart2 },
          { label: 'GATE Prep Help', prompt: 'Explain the GATE exam pattern and Virtual Calculator rules.', icon: BookOpen },
          { label: 'Portal Help', prompt: 'How do I navigate the student dashboard?', icon: HelpCircle },
        ];
    }
  };

  const actions = getActions();

  return (
    <div className="p-2 bg-slate-50 border-b border-slate-200">
      <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
        {actions.map((act, idx) => {
          const IconComponent = act.icon;
          return (
            <button
              key={idx}
              onClick={() => onSelectAction(act.prompt)}
              className="flex-shrink-0 flex items-center space-x-1 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 text-xs px-2.5 py-1 rounded-full transition-all shadow-2xs whitespace-nowrap cursor-pointer"
            >
              <IconComponent className="w-3 h-3 text-blue-600" />
              <span>{act.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
