'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Calculator, ShieldAlert, Clock, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import io from 'socket.io-client';
import { SecurityGuard } from '@/components/exam/SecurityGuard';
import { GateScientificCalculator } from '@/components/exam/GateScientificCalculator';
import { QuestionPalette } from '@/components/exam/QuestionPalette';

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
          handleFinalSubmit();
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
        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';
        const socket = io(socketUrl);
        socketRef.current = socket;

        socket.emit('student_join_exam', {
          assignmentId: data.assignmentId,
          studentId: userData.id,
          testId,
          registerNo: userData.registerNo,
          name: userData.name,
          department: userData.department,
        });

        socket.on('force_auto_submit', (payload: any) => {
          alert(`Automated Termination: ${payload.reason}`);
          handleFinalSubmit();
        });

        socket.on('faculty_warning_received', (payload: any) => {
          alert(`⚠️ INVIGILATOR OFFICIAL NOTICE:\n\n${payload.message}`);
        });
      }
    } catch (err: any) {
      alert('Error initializing exam session');
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

  const handleFinalSubmit = async () => {
    if (!confirm('Are you sure you want to submit your examination paper? This action is final.')) {
      return;
    }
    try {
      const res = await api.post('/exam/submit', {
        assignmentId: examData.assignmentId,
      });

      if (res.data?.success) {
        if (socketRef.current) socketRef.current.disconnect();
        router.push(`/student/solution/${examData.assignmentId}`);
      }
    } catch (err) {
      alert('Error submitting exam');
    }
  };

  if (loading || !examData) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center text-slate-600 space-y-3 font-sans">
        <div className="w-8 h-8 border-3 border-[#1E40AF] border-t-transparent rounded-full animate-spin" />
        <div className="text-sm font-medium">Securing CBT Examination Environment...</div>
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
            <div className="text-xs font-mono text-slate-600">
              Marks: <b className="text-emerald-700">+{currentQ.marks}</b> | Negative: <b className="text-red-700">-{currentQ.negativeMarks}</b>
            </div>
          </div>

          {/* Question Statement */}
          <div className="text-slate-900 text-base leading-relaxed mb-6 whitespace-pre-wrap font-medium">
            {currentQ.text}
          </div>

          {/* Options Display */}
          <div className="space-y-3 flex-1">
            {currentQ.type === 'NAT' ? (
              <div className="max-w-xs space-y-2">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Numerical Answer Entry:
                </label>
                <input
                  type="number"
                  step="any"
                  value={selectedAnswers[currentQ.id] || ''}
                  onChange={(e) => handleNATChange(e.target.value)}
                  placeholder="Enter calculated numerical answer"
                  className="erp-input font-mono font-bold text-emerald-700"
                />
              </div>
            ) : (
              currentQ.options.map((opt: any, optIdx: number) => {
                const isSelected =
                  currentQ.type === 'MCQ'
                    ? selectedAnswers[currentQ.id]?.[0] === optIdx
                    : (selectedAnswers[currentQ.id] || []).includes(optIdx);

                return (
                  <button
                    key={optIdx}
                    onClick={() => handleOptionSelect(optIdx)}
                    className={`w-full text-left p-3.5 rounded-md border transition-colors flex items-center space-x-3.5 ${
                      isSelected
                        ? 'bg-blue-50/80 border-[#1E40AF] text-slate-900 shadow-sm'
                        : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                        isSelected ? 'bg-[#1E40AF] text-white' : 'bg-slate-100 text-slate-700 border border-slate-300'
                      }`}
                    >
                      {String.fromCharCode(65 + optIdx)}
                    </div>
                    <span className="text-sm font-medium">{opt.text}</span>
                  </button>
                );
              })
            )}
          </div>

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
          onSubmitExam={handleFinalSubmit}
        />
      </div>
    </div>
  );
}
