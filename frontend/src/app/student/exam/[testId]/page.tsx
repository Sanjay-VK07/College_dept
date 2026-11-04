'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Calculator, ShieldAlert, Clock, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import io from 'socket.io-client';
import { SecurityGuard } from '@/components/exam/SecurityGuard';
import { GateScientificCalculator } from '@/components/exam/GateScientificCalculator';
import { QuestionPalette } from '@/components/exam/QuestionPalette';
import { QuestionOptionContent } from '@/components/question-bank/QuestionOptionContent';
import { QuestionRenderer } from '@/components/question-bank/QuestionRenderer';

export default function ExamPage() {
  const router = useRouter();
  const params = useParams();
  const testId = params.testId as string;

  const [user, setUser] = useState<any>(null);
  const [examData, setExamData] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSec, setRemainingSec] = useState(10800);
  const [currentViolations, setCurrentViolations] = useState(0);

  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, any>>({});
  const [isCalcOpen, setIsCalcOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [terminationNotice, setTerminationNotice] = useState<string | null>(null);
  const [invigilatorWarning, setInvigilatorWarning] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const socketRef = useRef<any>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('gsmas_user');
    const token = localStorage.getItem('gsmas_token');

    if (!savedUser || !token) {
      router.push('/');
      return;
    }

    const userData = JSON.parse(savedUser);
    setUser(userData);

    startExamSession(token, userData);
  }, []);

  // Timer Countdown Ticker
  useEffect(() => {
    if (loading || !examData) return;

    const interval = setInterval(() => {
      setRemainingSec((prev) => {
        if (prev <= 1) {
          // Time's up — this is involuntary, never ask "are you sure".
          submitExamNow();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [loading, examData]);

  // Socket Progress Heartbeat Ticker
  useEffect(() => {
    if (!examData?.assignmentId || !socketRef.current) return;

    const heartbeatInterval = setInterval(() => {
      if (socketRef.current) {
        socketRef.current.emit('student_heartbeat', {
          assignmentId: examData.assignmentId,
          currentQuestion: currentIndex + 1,
          remainingSec,
        });
      }
    }, 5000);

    return () => clearInterval(heartbeatInterval);
  }, [examData, currentIndex, remainingSec]);

  const startExamSession = async (token: string, userData: any) => {
    try {
      const response = await api.post(`/exam/start/${testId}`, {});

      if (response.data?.success) {
        const data = response.data.data;
        setExamData(data);
        setQuestions(data.questions);
        setRemainingSec(data.remainingSec);

        // Preload saved answers
        const initialAnswers: Record<string, any> = {};
        data.questions.forEach((q: any) => {
          if (q.savedAnswer !== null && q.savedAnswer !== undefined) {
            initialAnswers[q.id] = q.savedAnswer;
          }
        });
        setSelectedAnswers(initialAnswers);

        // Socket connection
        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5001';
        const socket = io(socketUrl, { auth: { token: localStorage.getItem('gsmas_token') } });
        socketRef.current = socket;

        socket.emit('student_join_exam', {
          assignmentId: data.assignmentId,
          testId,
        });

        socket.on('force_auto_submit', (payload: any) => {
          // The backend has already completed the submission transactionally at this point
          // (violation-limit or invigilator termination) — this is a notice, not a request for
          // permission. Never re-run the submit flow or ask "are you sure" for something that's
          // already final.
          if (socketRef.current) socketRef.current.disconnect();
          setTerminationNotice(payload.reason || 'Your examination was automatically terminated and submitted.');
        });

        socket.on('faculty_warning_received', (payload: any) => {
          setInvigilatorWarning(payload.message);
        });
      }
    } catch (err: any) {
      setPageError(err.response?.data?.message || 'Error initializing exam session. Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOptionSelect = (optionIndex: number) => {
    const q = questions[currentIndex];
    let newAns: any;

    if (q.type === 'MCQ') {
      newAns = [optionIndex];
    } else if (q.type === 'MSQ') {
      const existing = (selectedAnswers[q.id] as number[]) || [];
      if (existing.includes(optionIndex)) {
        newAns = existing.filter((i) => i !== optionIndex);
      } else {
        newAns = [...existing, optionIndex];
      }
    }

    setSelectedAnswers((prev) => ({ ...prev, [q.id]: newAns }));
    autoSave(q.id, newAns, 'ANSWERED');
  };

  const handleNATChange = (val: string) => {
    const q = questions[currentIndex];
    setSelectedAnswers((prev) => ({ ...prev, [q.id]: val }));
    autoSave(q.id, val, 'ANSWERED');
  };

  const autoSave = async (questionId: string, chosenAnswer: any, statusStr: string) => {
    try {
      await api.post('/exam/autosave', {
        assignmentId: examData.assignmentId,
        questionId,
        chosenAnswer,
        status: statusStr,
        timeSpentSec: 5,
      });

      if (socketRef.current) {
        socketRef.current.emit('student_heartbeat', {
          assignmentId: examData.assignmentId,
          currentQuestion: currentIndex + 1,
          remainingSec,
        });
      }
    } catch (err) {
      console.warn('Autosave queued locally');
    }
  };

  const handleSecurityViolation = (type: string, details?: string) => {
    setCurrentViolations((prev) => {
      const updated = prev + 1;
      if (socketRef.current && examData) {
        socketRef.current.emit('security_violation_event', {
          assignmentId: examData.assignmentId,
          violationType: type,
          details,
        });
      }
      return updated;
    });
  };

  const handleSaveAndNext = () => {
    const q = questions[currentIndex];
    const ans = selectedAnswers[q.id];
    const statusStr = ans !== undefined && ans !== null && ans !== '' ? 'ANSWERED' : 'SKIPPED';

    updateQuestionStatus(q.id, statusStr);
    if (currentIndex < questions.length - 1) setCurrentIndex((prev) => prev + 1);
  };

  const handleMarkForReviewAndNext = () => {
    const q = questions[currentIndex];
    const ans = selectedAnswers[q.id];
    const statusStr = ans !== undefined && ans !== null && ans !== '' ? 'ANSWERED_AND_MARKED' : 'MARKED_FOR_REVIEW';

    updateQuestionStatus(q.id, statusStr);
    if (currentIndex < questions.length - 1) setCurrentIndex((prev) => prev + 1);
  };

  const handleClearResponse = () => {
    const q = questions[currentIndex];
    setSelectedAnswers((prev) => {
      const copy = { ...prev };
      delete copy[q.id];
      return copy;
    });

    updateQuestionStatus(q.id, 'SKIPPED');
    autoSave(q.id, null, 'SKIPPED');
  };

  const updateQuestionStatus = (questionId: string, newStatus: any) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === questionId ? { ...q, status: newStatus } : q))
    );
  };

  // The actual submission — used by every path (manual confirm, timer expiry). Forced-termination
  // paths (violation limit, invigilator kill) never call this: the backend already completes
  // those submissions itself before it tells the client, so re-submitting here would be redundant
  // at best and a confusing "are you sure" prompt for an already-decided outcome at worst.
  const submitExamNow = async () => {
    setIsSubmitting(true);
    try {
      const res = await api.post('/exam/submit', {
        assignmentId: examData.assignmentId,
      });

      if (res.data?.success) {
        if (socketRef.current) socketRef.current.disconnect();
        router.push(`/student/solution/${examData.assignmentId}`);
        return;
      }
      setPageError(res.data?.message || 'Failed to submit exam.');
    } catch (err: any) {
      setPageError(err.response?.data?.message || 'Error submitting exam. Please try again.');
    } finally {
      setIsSubmitting(false);
      setIsSubmitConfirmOpen(false);
    }
  };

  const handleManualSubmitClick = () => setIsSubmitConfirmOpen(true);

  if (loading || !examData) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center text-slate-600 space-y-3 font-sans p-6 text-center">
        {pageError ? (
          <>
            <AlertCircle className="w-8 h-8 text-red-600" />
            <div className="text-sm font-semibold text-red-800 max-w-sm">{pageError}</div>
            <button onClick={() => router.push('/student/dashboard')} className="erp-btn-secondary py-2 text-xs mt-2">
              Back to Dashboard
            </button>
          </>
        ) : (
          <>
            <div className="w-8 h-8 border-3 border-[#1E40AF] border-t-transparent rounded-full animate-spin" />
            <div className="text-sm font-medium">Securing CBT Examination Environment...</div>
          </>
        )}
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col h-screen overflow-hidden select-none-security font-sans">
      {/* Security Monitoring Engine */}
      <SecurityGuard
        onViolation={handleSecurityViolation}
        maxViolations={examData.test.maxViolations || 5}
        currentViolations={currentViolations}
      />

      {/* Scientific Calculator Modal */}
      <GateScientificCalculator isOpen={isCalcOpen} onClose={() => setIsCalcOpen(false)} />

      {/* Forced Termination Notice — the backend has already completed this submission; this is
          purely informational, with a single way forward (view the result). */}
      {terminationNotice && (
        <div className="fixed inset-0 z-[60] bg-slate-900/95 flex items-center justify-center p-6 text-center">
          <div className="erp-card max-w-md w-full p-8 space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-100 text-red-600 border border-red-200">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Examination Terminated</h2>
            <p className="text-xs text-slate-600 leading-relaxed">{terminationNotice}</p>
            <button
              onClick={() => router.push(`/student/solution/${examData.assignmentId}`)}
              className="erp-btn-primary w-full py-2.5 text-xs font-semibold"
            >
              View Result
            </button>
          </div>
        </div>
      )}

      {/* Invigilator Warning */}
      {invigilatorWarning && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-50 border border-amber-300 text-amber-900 px-5 py-2.5 rounded-md text-xs font-semibold flex items-center space-x-3 shadow-lg max-w-lg">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Invigilator notice: {invigilatorWarning}</span>
          <button
            onClick={() => setInvigilatorWarning(null)}
            className="ml-3 text-[11px] bg-amber-200 hover:bg-amber-300 px-2 py-0.5 rounded text-amber-900 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Non-fatal submission error (autosave/init issues never block the exam — this does) */}
      {pageError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-300 text-red-900 px-5 py-2.5 rounded-md text-xs font-semibold flex items-center space-x-3 shadow-lg max-w-lg">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{pageError}</span>
          <button
            onClick={() => setPageError(null)}
            className="ml-3 text-[11px] bg-red-200 hover:bg-red-300 px-2 py-0.5 rounded text-red-900 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Manual Submit Confirmation */}
      {isSubmitConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded max-w-md w-full">
            <header className="px-5 py-3 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">Submit examination paper?</h3>
            </header>
            <div className="p-5">
              <p className="text-xs text-slate-600">This action is final — you will not be able to change any answers after submitting.</p>
            </div>
            <footer className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setIsSubmitConfirmOpen(false)}
                disabled={isSubmitting}
                className="px-4 py-2 rounded border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submitExamNow}
                disabled={isSubmitting}
                className="px-4 py-2 rounded text-white text-xs font-semibold disabled:opacity-50 bg-[#1E40AF] hover:bg-blue-800"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Paper'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* CBT Examination Navbar */}
      <header className="bg-[#1E40AF] text-white border-b border-blue-900 px-6 py-2.5 flex items-center justify-between z-20 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="font-bold text-white text-base">{examData.test.title}</div>
          <span className="erp-badge-blue bg-white/10 text-white border-white/20">
            {currentQ.subject}
          </span>
        </div>

        {/* Controls & Candidate Profile */}
        <div className="flex items-center space-x-5">
          <button
            onClick={() => setIsCalcOpen(!isCalcOpen)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/20 transition-colors"
          >
            <Calculator className="w-4 h-4 text-blue-200" />
            <span>Scientific Calculator</span>
          </button>

          <div className="flex items-center space-x-2 px-3.5 py-1 rounded bg-white text-[#1E40AF] font-mono text-sm font-bold border border-blue-200 shadow-inner">
            <Clock className="w-4 h-4 text-[#1E40AF]" />
            <span>Time Left: {formatTimer(remainingSec)}</span>
          </div>

          <div className="text-right border-l border-blue-800 pl-4 hidden sm:block">
            <div className="text-xs font-bold text-white">{user.name}</div>
            <div className="text-[10px] text-blue-200 font-mono">Reg: {user.registerNo}</div>
          </div>
        </div>
      </header>

      {/* Main CBT Work Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Question Reading & Answer Panel */}
        <div className="flex-1 flex flex-col p-6 overflow-y-auto bg-white">
          {/* Question Header Metadata */}
          <div className="flex justify-between items-center pb-3 border-b border-slate-200 mb-6">
            <div className="flex items-center space-x-3">
              <span className="text-lg font-bold text-[#1E40AF]">Question {currentQ.order}</span>
              <span className="erp-badge-gray">{currentQ.type}</span>
              <span className="erp-badge-gray">Difficulty: {currentQ.difficulty}</span>
            </div>
            <div className="text-xs font-mono text-slate-600 flex items-center gap-3">
              <span>Marks allotted: <b className="text-emerald-700">{currentQ.marks === 1 ? '1 mark' : `${currentQ.marks} marks`}</b></span>
              <span className="text-slate-300">•</span>
              {currentQ.type === 'MCQ' ? (
                <span>Negative marks deducted: <b className="text-rose-600">{currentQ.negativeMarks ? `${currentQ.negativeMarks} marks` : (currentQ.marks === 2 ? '0.66 marks' : '0.33 marks')}</b></span>
              ) : (
                <span className="text-slate-500">Negative marks: <b className="text-slate-700">0.00 marks (No negative marking)</b></span>
              )}
            </div>
          </div>

          {/* Image-First Question & Options Rendering */}
          <QuestionRenderer
            question={currentQ}
            selectedAnswer={selectedAnswers[currentQ.id]}
            viewMode="STUDENT_EXAM"
            onSelectAnswer={(ans) => {
              if (currentQ.type === 'NAT' || currentQ.type === 'FREE_RESPONSE') {
                const natVal =
                  typeof ans === 'object' && ans !== null && 'value' in ans
                    ? String(ans.value)
                    : typeof ans === 'string'
                    ? ans
                    : typeof ans === 'number'
                    ? String(ans)
                    : '';
                handleNATChange(natVal);
              } else if (Array.isArray(ans) && currentQ.type === 'MCQ') {
                if (ans.length > 0) handleOptionSelect(ans[0]);
              } else if (currentQ.type === 'MSQ') {
                const msqAns = Array.isArray(ans) ? ans : [ans];
                setSelectedAnswers((prev) => ({ ...prev, [currentQ.id]: msqAns }));
                autoSave(currentQ.id, msqAns, 'ANSWERED');
              } else {
                setSelectedAnswers((prev) => ({ ...prev, [currentQ.id]: ans }));
                autoSave(currentQ.id, ans, 'ANSWERED');
              }
            }}
          />

          {/* Bottom Controls Bar */}
          <div className="pt-4 border-t border-slate-200 flex justify-between items-center mt-auto">
            <div className="space-x-2">
              <button
                onClick={handleMarkForReviewAndNext}
                className="erp-btn-secondary py-2 text-xs"
              >
                Mark for Review & Next
              </button>
              <button
                onClick={handleClearResponse}
                className="erp-btn-secondary py-2 text-xs text-slate-600"
              >
                Clear Response
              </button>
            </div>

            <div className="space-x-2 flex items-center">
              <button
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((prev) => prev - 1)}
                className="erp-btn-secondary py-2 text-xs"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>
              <button
                onClick={handleSaveAndNext}
                className="erp-btn-primary py-2 text-xs"
              >
                <span>Save & Next</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* TCS iON Style Right Question Palette */}
        <QuestionPalette
          questions={questions}
          currentIndex={currentIndex}
          onSelectQuestion={(idx) => setCurrentIndex(idx)}
          onSubmitExam={handleManualSubmitClick}
        />
      </div>
    </div>
  );
}
