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
  // Count status summaries
  const answeredCount = questions.filter(q => q.status === 'ANSWERED').length;
  const notAnsweredCount = questions.filter(q => q.status === 'VISITED' || q.status === 'SKIPPED').length;
  const notVisitedCount = questions.filter(q => q.status === 'NOT_VISITED').length;
  const markedReviewCount = questions.filter(q => q.status === 'MARKED_FOR_REVIEW').length;
  const answeredMarkedCount = questions.filter(q => q.status === 'ANSWERED_AND_MARKED').length;

  const getStatusColor = (status: string, isCurrent: boolean) => {
    let baseColor = 'bg-slate-700 text-slate-300';
    if (status === 'ANSWERED') baseColor = 'bg-emerald-600 text-white';
    else if (status === 'VISITED' || status === 'SKIPPED') baseColor = 'bg-rose-600 text-white';
    else if (status === 'MARKED_FOR_REVIEW') baseColor = 'bg-purple-600 text-white';
    else if (status === 'ANSWERED_AND_MARKED') baseColor = 'bg-purple-600 text-white relative';

    return `${baseColor} ${isCurrent ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-900 font-bold scale-105' : ''}`;
  };

  return (
    <div className="w-80 glass-panel border-l border-slate-800 flex flex-col h-full select-none-security">
      {/* Profile & Legend Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/60">
        <h3 className="text-sm font-semibold text-slate-200 mb-3 uppercase tracking-wider">Question Palette</h3>

        {/* GATE Status Legend */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center space-x-2">
            <span className="w-5 h-5 rounded bg-emerald-600 flex items-center justify-center font-bold text-[10px] text-white">
              {answeredCount}
            </span>
            <span className="text-slate-400">Answered</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-5 h-5 rounded bg-rose-600 flex items-center justify-center font-bold text-[10px] text-white">
              {notAnsweredCount}
            </span>
            <span className="text-slate-400">Not Answered</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-5 h-5 rounded bg-slate-700 flex items-center justify-center font-bold text-[10px] text-slate-300">
              {notVisitedCount}
            </span>
            <span className="text-slate-400">Not Visited</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-5 h-5 rounded bg-purple-600 flex items-center justify-center font-bold text-[10px] text-white">
              {markedReviewCount}
            </span>
            <span className="text-slate-400">Marked for Review</span>
          </div>
          <div className="col-span-2 flex items-center space-x-2">
            <span className="w-5 h-5 rounded bg-purple-600 relative flex items-center justify-center font-bold text-[10px] text-white">
              {answeredMarkedCount}
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-400" />
            </span>
            <span className="text-slate-400">Ans & Marked for Review</span>
          </div>
        </div>
      </div>

      {/* Grid Palette Buttons */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-4 gap-2.5">
          {questions.map((q, idx) => {
            const isCurrent = idx === currentIndex;
            return (
              <button
                key={q.id}
                onClick={() => onSelectQuestion(idx)}
                className={`w-12 h-10 rounded-md font-medium text-xs flex items-center justify-center transition-all ${getStatusColor(
                  q.status,
                  isCurrent
                )}`}
              >
                {q.order}
                {q.status === 'ANSWERED_AND_MARKED' && (
                  <span className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-400" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Submit Action */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/80">
        <button
          onClick={onSubmitExam}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 font-bold text-white text-sm rounded-lg shadow-lg shadow-emerald-600/30 transition-all uppercase tracking-wider"
        >
          Submit Final Exam
        </button>
      </div>
    </div>
  );
};
