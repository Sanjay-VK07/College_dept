'use client';

import React, { useState } from 'react';
import { QuestionRenderer } from '@/components/question-bank/QuestionRenderer';
import { GateQuestion } from '@/types/question';
import { CheckCircle2, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function TestQuestionViewerPage() {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, any>>({
    '1.1.5': ['B'], // Student clicked B
    '2.1.8': ['A', 'C', 'D'], // Student selected A, C, D
    '2.1.6': { value: 6 }, // Student submitted 6
    '1.2.15': { value: 12.5 }, // Student submitted 12.5
    '4.20.6': { value: -7.75 }, // Student submitted -7.75
  });

  const [showReviewMode, setShowReviewMode] = useState<boolean>(false);

  // =========================================================================
  // TEST 1 — MCQ
  // questionType: MCQ, correctAnswer: "B"
  // Expected: A/B/C/D buttons, single selection
  // =========================================================================
  const test1_MCQ: GateQuestion = {
    questionId: "1.1.5",
    questionType: "MCQ",
    questionImage: {
      src: "images/1_1_5.png",
      width: 2168,
      height: 449,
    },
    options: [],
    correctAnswer: "B",
    status: "verified",
    display: {
      defaultExpanded: true,
    },
    source: {
      pdf: "filter1_volume3 (1)(1).pdf",
      page: 29,
    },
    type: "MCQ",
    marks: 1,
    negativeMarks: 0.33,
  };

  // =========================================================================
  // TEST 2 — MSQ
  // questionType: MSQ, correctAnswer: ["A", "C", "D"]
  // Expected: A/B/C/D buttons, multiple selections allowed
  // =========================================================================
  const test2_MSQ: GateQuestion = {
    questionId: "2.1.8",
    questionType: "MSQ",
    questionImage: {
      src: "images/2_1_8.png",
      width: 2168,
      height: 845,
    },
    options: [],
    correctAnswer: ["A", "C", "D"],
    status: "verified",
    display: {
      defaultExpanded: true,
    },
    source: {
      pdf: "filter1_volume3 (1)(1).pdf",
      page: 112,
    },
    type: "MSQ",
    marks: 2,
    negativeMarks: 0,
  };

  // =========================================================================
  // TEST 3 — NAT INTEGER
  // questionType: NAT, correctAnswer: { value: 6 }
  // Expected: numerical input, NO A/B/C/D buttons
  // =========================================================================
  const test3_NAT_Integer: GateQuestion = {
    questionId: "2.1.6",
    questionType: "NAT",
    questionImage: {
      src: "images/2_1_6.png",
      width: 2168,
      height: 472,
    },
    options: [],
    correctAnswer: {
      value: 6,
    },
    status: "verified",
    display: {
      defaultExpanded: true,
    },
    source: {
      pdf: "filter1_volume3 (1)(1).pdf",
      page: 112,
    },
    type: "NAT",
    marks: 1,
    negativeMarks: 0,
  };

  // =========================================================================
  // TEST 4 — NAT DECIMAL
  // questionType: NAT, correctAnswer: { value: 12.5 }
  // Expected: decimal input, NO A/B/C/D buttons
  // =========================================================================
  const test4_NAT_Decimal: GateQuestion = {
    questionId: "1.2.15",
    questionType: "NAT",
    questionImage: {
      src: "images/1_5_37.png", // Valid 300 DPI image
      width: 2168,
      height: 522,
    },
    options: [],
    correctAnswer: {
      value: 12.5,
    },
    status: "verified",
    display: {
      defaultExpanded: true,
    },
    source: {
      pdf: "filter1_volume3 (1)(1).pdf",
      page: 45,
    },
    type: "NAT",
    marks: 2,
    negativeMarks: 0,
  };

  // =========================================================================
  // TEST 5 — NAT NEGATIVE
  // questionType: NAT, correctAnswer: { value: -7.75 } (Real question 4.20.6)
  // Expected: input accepts negative numbers, NO A/B/C/D buttons
  // =========================================================================
  const test5_NAT_Negative: GateQuestion = {
    questionId: "4.20.6",
    questionType: "NAT",
    questionImage: {
      src: "images/4_20_6.png",
      width: 2168,
      height: 655,
    },
    options: [],
    correctAnswer: {
      value: -7.75,
    },
    status: "verified",
    display: {
      defaultExpanded: true,
    },
    source: {
      pdf: "filter1_volume3 (1)(1).pdf",
      page: 331,
    },
    type: "NAT",
    marks: 2,
    negativeMarks: 0,
  };

  // =========================================================================
  // TEST 6 — NAT REVIEW (Genuinely missing/withheld answer)
  // questionType: NAT, correctAnswer: null (Real question 1.24.33)
  // Expected: status "needs_review", collapsed by default, specific review banner
  // =========================================================================
  const test6_NAT_Review: GateQuestion = {
    questionId: "1.24.33",
    questionType: "NAT",
    questionImage: {
      src: "images/1_24_33.png",
      width: 2168,
      height: 470,
    },
    options: [],
    correctAnswer: null, // Genuinely missing in printed source
    status: "needs_review",
    reviewReason: "ANSWER_MISSING",
    reviewReasonMessage: "Needs review: answer key is missing.",
    display: {
      defaultExpanded: false, // Collapsed by default
    },
    source: {
      pdf: "filter1_volume3 (1)(1).pdf",
      page: 89,
    },
    type: "NAT",
    marks: 1,
    negativeMarks: 0,
  };

  const handleSelectAnswer = (qId: string, ans: any) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [qId]: ans,
    }));
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6 md:p-10 font-sans text-slate-900">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Top Header */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin/dashboard" className="text-slate-500 hover:text-slate-800 text-sm flex items-center gap-1 font-medium">
                <ArrowLeft className="w-4 h-4" /> Admin Dashboard
              </Link>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              GATE Question Viewer Test Suite (NAT / MCQ / MSQ)
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Testing canonical question types, strict A/B/C/D vs NAT input isolation, and exam/review modes.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              id="toggle-mode-btn"
              onClick={() => setShowReviewMode(!showReviewMode)}
              className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors shadow-sm cursor-pointer ${
                showReviewMode
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {showReviewMode ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              <span>{showReviewMode ? 'Review Mode (Answers Shown)' : 'Exam Mode (Answers Hidden)'}</span>
            </button>
          </div>
        </div>

        {/* Current Mode Indicator */}
        <div
          id="mode-indicator"
          className={`p-4 rounded-xl border text-sm flex items-center justify-between font-mono ${
            showReviewMode
              ? 'bg-amber-50 border-amber-300 text-amber-900'
              : 'bg-blue-50 border-blue-200 text-blue-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span className="font-sans font-bold">
              Current Mode: {showReviewMode ? 'REVIEW / SOLUTION MODE' : 'NORMAL EXAM / SOLVING MODE'}
            </span>
          </div>
          <span className="text-xs font-sans text-slate-600">
            {showReviewMode
              ? 'Correct answer and student performance are revealed'
              : 'Correct answer is strictly hidden; student responses recorded'}
          </span>
        </div>

        {/* TEST 1: MCQ */}
        <div id="test-card-mcq" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded font-mono font-bold">TEST 1</span>
              <span>MCQ — Single Selection (Question 1.1.5)</span>
            </h2>
            <span className="text-xs font-mono text-slate-500">type: MCQ • answer: B</span>
          </div>
          <QuestionRenderer
            question={test1_MCQ}
            selectedAnswer={selectedAnswers['1.1.5']}
            onSelectAnswer={(ans) => handleSelectAnswer('1.1.5', ans)}
            showCorrectAnswer={showReviewMode}
            viewMode={showReviewMode ? 'SOLUTION_VIEW' : 'STUDENT_EXAM'}
          />
        </div>

        {/* TEST 2: MSQ */}
        <div id="test-card-msq" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-xs rounded font-mono font-bold">TEST 2</span>
              <span>MSQ — Multiple Selection (Question 2.1.8)</span>
            </h2>
            <span className="text-xs font-mono text-slate-500">type: MSQ • answer: [A, C, D]</span>
          </div>
          <QuestionRenderer
            question={test2_MSQ}
            selectedAnswer={selectedAnswers['2.1.8']}
            onSelectAnswer={(ans) => handleSelectAnswer('2.1.8', ans)}
            showCorrectAnswer={showReviewMode}
            viewMode={showReviewMode ? 'SOLUTION_VIEW' : 'STUDENT_EXAM'}
          />
        </div>

        {/* TEST 3: NAT Integer */}
        <div id="test-card-nat-int" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-xs rounded font-mono font-bold">TEST 3</span>
              <span>NAT Integer — Numerical Input (Question 2.1.6)</span>
            </h2>
            <span className="text-xs font-mono text-slate-500">type: NAT • answer: 6 • NO A/B/C/D</span>
          </div>
          <QuestionRenderer
            question={test3_NAT_Integer}
            selectedAnswer={selectedAnswers['2.1.6']}
            onSelectAnswer={(ans) => handleSelectAnswer('2.1.6', ans)}
            showCorrectAnswer={showReviewMode}
            viewMode={showReviewMode ? 'SOLUTION_VIEW' : 'STUDENT_EXAM'}
          />
        </div>

        {/* TEST 4: NAT Decimal */}
        <div id="test-card-nat-dec" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span className="px-2 py-0.5 bg-teal-100 text-teal-800 text-xs rounded font-mono font-bold">TEST 4</span>
              <span>NAT Decimal — Numerical Input (Question 1.2.15)</span>
            </h2>
            <span className="text-xs font-mono text-slate-500">type: NAT • answer: 12.5 • NO A/B/C/D</span>
          </div>
          <QuestionRenderer
            question={test4_NAT_Decimal}
            selectedAnswer={selectedAnswers['1.2.15']}
            onSelectAnswer={(ans) => handleSelectAnswer('1.2.15', ans)}
            showCorrectAnswer={showReviewMode}
            viewMode={showReviewMode ? 'SOLUTION_VIEW' : 'STUDENT_EXAM'}
          />
        </div>

        {/* TEST 5: NAT Negative */}
        <div id="test-card-nat-neg" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span className="px-2 py-0.5 bg-cyan-100 text-cyan-800 text-xs rounded font-mono font-bold">TEST 5</span>
              <span>NAT Negative — Negative Decimal Input (Question 4.20.6)</span>
            </h2>
            <span className="text-xs font-mono text-slate-500">type: NAT • answer: -7.75 • NO A/B/C/D</span>
          </div>
          <QuestionRenderer
            question={test5_NAT_Negative}
            selectedAnswer={selectedAnswers['4.20.6']}
            onSelectAnswer={(ans) => handleSelectAnswer('4.20.6', ans)}
            showCorrectAnswer={showReviewMode}
            viewMode={showReviewMode ? 'SOLUTION_VIEW' : 'STUDENT_EXAM'}
          />
        </div>

        {/* TEST 6: NAT Review */}
        <div id="test-card-nat-review" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-xs rounded font-mono font-bold">TEST 6</span>
              <span>NAT Review — Missing Answer Key (Question 1.24.33)</span>
            </h2>
            <span className="text-xs font-mono text-slate-500">status: needs_review • answer: null</span>
          </div>
          <QuestionRenderer
            key={`test6-nat-review-${showReviewMode ? 'review' : 'exam'}`}
            question={test6_NAT_Review}
            selectedAnswer={selectedAnswers['1.24.33']}
            onSelectAnswer={(ans) => handleSelectAnswer('1.24.33', ans)}
            showCorrectAnswer={showReviewMode}
            viewMode={showReviewMode ? 'SOLUTION_VIEW' : 'ADMIN_REVIEW'}
            defaultExpanded={false}
          />
        </div>
      </div>
    </div>
  );
}
