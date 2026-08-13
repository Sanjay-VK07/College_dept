'use client';

import React from 'react';

export interface QuestionPaletteItem {
  id: string;
  order: number;
  status: 'NOT_VISITED' | 'VISITED' | 'ANSWERED' | 'SKIPPED' | 'MARKED_FOR_REVIEW' | 'ANSWERED_AND_MARKED';
}

interface QuestionPaletteProps {
  questions: QuestionPaletteItem[];
  currentIndex: number;
  onSelectQuestion: (index: number) => void;
  onSubmitExam: () => void;
}

export const QuestionPalette: React.FC<QuestionPaletteProps> = ({
  questions,
  currentIndex,
  onSelectQuestion,
  onSubmitExam,
}) => {
  // Status Counts
  const answeredCount = questions.filter((q) => q.status === 'ANSWERED').length;
  const notAnsweredCount = questions.filter((q) => q.status === 'VISITED' || q.status === 'SKIPPED').length;
  const notVisitedCount = questions.filter((q) => q.status === 'NOT_VISITED').length;
  const markedReviewCount = questions.filter((q) => q.status === 'MARKED_FOR_REVIEW').length;
  const answeredMarkedCount = questions.filter((q) => q.status === 'ANSWERED_AND_MARKED').length;

  const getStatusStyle = (status: string, isCurrent: boolean) => {
    let base = 'bg-slate-100 text-slate-700 border border-slate-300';
    if (status === 'ANSWERED') base = 'bg-[#16A34A] text-white border-[#16A34A] font-bold';
    else if (status === 'VISITED' || status === 'SKIPPED') base = 'bg-[#DC2626] text-white border-[#DC2626] font-bold';
    else if (status === 'MARKED_FOR_REVIEW') base = 'bg-[#7C3AED] text-white border-[#7C3AED] font-bold';
    else if (status === 'ANSWERED_AND_MARKED') base = 'bg-[#7C3AED] text-white border-[#7C3AED] font-bold relative';

    return `${base} ${isCurrent ? 'ring-2 ring-[#1E40AF] ring-offset-2 font-bold scale-105' : ''}`;
  };

  return (
    <div className="w-80 bg-white border-l border-slate-200 flex flex-col h-full select-none-security font-sans shadow-sm">
      {/* Legend Header */}
      <div className="p-4 border-b border-slate-200 bg-slate-50 space-y-3">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Question Palette & Status</h3>

        {/* Legend Status Counters Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center space-x-2">
            <span className="w-5 h-5 rounded bg-[#16A34A] text-white font-bold text-[10px] flex items-center justify-center">
              {answeredCount}
            </span>
            <span className="text-slate-600">Answered</span>
          </div>

          <div className="flex items-center space-x-2">
            <span className="w-5 h-5 rounded bg-[#DC2626] text-white font-bold text-[10px] flex items-center justify-center">
              {notAnsweredCount}
            </span>
            <span className="text-slate-600">Not Answered</span>
          </div>

          <div className="flex items-center space-x-2">
            <span className="w-5 h-5 rounded bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center border border-slate-300">
              {notVisitedCount}
            </span>
            <span className="text-slate-600">Not Visited</span>
          </div>

          <div className="flex items-center space-x-2">
            <span className="w-5 h-5 rounded bg-[#7C3AED] text-white font-bold text-[10px] flex items-center justify-center">
              {markedReviewCount}
            </span>
            <span className="text-slate-600">Marked Review</span>
          </div>

          <div className="col-span-2 flex items-center space-x-2">
            <span className="w-5 h-5 rounded bg-[#7C3AED] text-white font-bold text-[10px] flex items-center justify-center relative">
              {answeredMarkedCount}
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-white" />
            </span>
            <span className="text-slate-600">Ans & Marked for Review</span>
          </div>
        </div>
      </div>

      {/* Question Number Buttons Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-4 gap-2">
          {questions.map((q, idx) => {
            const isCurrent = idx === currentIndex;
            return (
              <button
                key={q.id}
                onClick={() => onSelectQuestion(idx)}
                className={`w-12 h-10 rounded text-xs flex items-center justify-center transition-colors ${getStatusStyle(
                  q.status,
                  isCurrent
                )}`}
              >
                {q.order}
                {q.status === 'ANSWERED_AND_MARKED' && (
                  <span className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-400 border border-white" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Submit Action Footer */}
      <div className="p-4 border-t border-slate-200 bg-slate-50">
        <button
          onClick={onSubmitExam}
          className="erp-btn-success w-full py-2.5 font-bold uppercase tracking-wider text-xs"
        >
          Submit Final Examination
        </button>
      </div>
    </div>
  );
};
