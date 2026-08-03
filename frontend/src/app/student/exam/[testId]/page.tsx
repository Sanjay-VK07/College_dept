'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Calculator, ShieldAlert, Clock, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react';
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
    if (remainingSec <= 0) return;
    const interval = setInterval(() => {
      setRemainingSec(prev => {
        if (prev <= 1) {
          handleFinalSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [remainingSec]);

  // Periodic Socket Progress Heartbeat Ticker (every 5s)
  useEffect(() => {
    if (!examData?.assignmentId || !socketRef.current) return;

    const heartbeatInterval = setInterval(() => {
      if (socketRef.current) {
        console.log(`💓 [Socket.IO] Emitting heartbeat: Q${currentIndex + 1}, ${remainingSec}s remaining`);
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

      if (response.data.success) {
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

        // Connect Socket.IO for invigilator live monitoring
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

        // Listen for forced auto submit from invigilator
        socket.on('force_auto_submit', (payload: any) => {
          alert(`Auto Submit Triggered: ${payload.reason}`);
          handleFinalSubmit();
        });

        // Listen for remote faculty warning message
        socket.on('faculty_warning_received', (payload: any) => {
          alert(`⚠️ INVIGILATOR WARNING:\n\n${payload.message}`);
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
        newAns = existing.filter(i => i !== optionIndex);
      } else {
        newAns = [...existing, optionIndex];
      }
    }

    setSelectedAnswers(prev => ({ ...prev, [q.id]: newAns }));
    autoSave(q.id, newAns, 'ANSWERED');
  };

  const handleNATChange = (val: string) => {
    const q = questions[currentIndex];
    setSelectedAnswers(prev => ({ ...prev, [q.id]: val }));
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

      // Emit Heartbeat to Socket
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
    setCurrentViolations(prev => {
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
    if (currentIndex < questions.length - 1) setCurrentIndex(prev => prev + 1);
  };

  const handleMarkForReviewAndNext = () => {
    const q = questions[currentIndex];
    const ans = selectedAnswers[q.id];
    const statusStr = ans !== undefined && ans !== null && ans !== '' ? 'ANSWERED_AND_MARKED' : 'MARKED_FOR_REVIEW';

    updateQuestionStatus(q.id, statusStr);
    if (currentIndex < questions.length - 1) setCurrentIndex(prev => prev + 1);
  };

  const handleClearResponse = () => {
    const q = questions[currentIndex];
    const newAns = undefined;
    setSelectedAnswers(prev => {
      const copy = { ...prev };
      delete copy[q.id];
      return copy;
    });

    updateQuestionStatus(q.id, 'SKIPPED');
    autoSave(q.id, null, 'SKIPPED');
  };

  const updateQuestionStatus = (questionId: string, newStatus: any) => {
    setQuestions(prev =>
      prev.map(q => (q.id === questionId ? { ...q, status: newStatus } : q))
    );
  };

  const handleFinalSubmit = async () => {
    try {
      const res = await api.post('/exam/submit', {
        assignmentId: examData.assignmentId,
      });

      if (res.data.success) {
        if (socketRef.current) socketRef.current.disconnect();
        router.push(`/student/solution/${examData.assignmentId}`);
      }
    } catch (err) {
      alert('Error submitting exam');
    }
  };

  if (loading || !examData) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mr-3" />
        Securing GATE Examination Environment...
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col h-screen overflow-hidden select-none-security">
      {/* Browser Security Guard */}
      <SecurityGuard
        onViolation={handleSecurityViolation}
        maxViolations={examData.test.maxViolations || 5}
        currentViolations={currentViolations}
      />

      {/* Official GATE Scientific Calculator Modal */}
      <GateScientificCalculator isOpen={isCalcOpen} onClose={() => setIsCalcOpen(false)} />

      {/* Top Examination Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between z-20">
        <div className="flex items-center space-x-4">
          <div className="font-bold text-white text-base">{examData.test.title}</div>
          <span className="px-2.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-xs font-mono">
            {currentQ.subject}
          </span>
        </div>

        {/* Student Reg & Timer & Calculator Button */}
        <div className="flex items-center space-x-6">
          <button
            onClick={() => setIsCalcOpen(!isCalcOpen)}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold"
          >
            <Calculator className="w-4 h-4" />
            <span>Scientific Calculator</span>
          </button>

          <div className="flex items-center space-x-2 px-4 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-emerald-400 font-mono text-sm font-bold">
            <Clock className="w-4 h-4" />
            <span>Time Left: {formatTimer(remainingSec)}</span>
          </div>

          <div className="text-right border-l border-slate-800 pl-4">
            <div className="text-xs font-bold text-slate-200">{user.name}</div>
            <div className="text-[10px] text-slate-400 font-mono">Reg: {user.registerNo}</div>
          </div>
        </div>
      </header>

      {/* Middle Exam Section */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Question & Options Area */}
        <div className="flex-1 flex flex-col p-6 overflow-y-auto bg-slate-950">
          {/* Question Header Meta */}
          <div className="flex justify-between items-center pb-4 border-b border-slate-800 mb-6">
            <div className="flex items-center space-x-3">
              <span className="text-lg font-bold text-indigo-400">Question {currentQ.order}</span>
              <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-slate-800 text-slate-300">
                {currentQ.type}
              </span>
              <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-slate-800 text-slate-300">
                Difficulty: {currentQ.difficulty}
              </span>
            </div>
            <div className="text-xs font-mono text-slate-400">
              Marks: <b className="text-emerald-400">+{currentQ.marks}</b> | Negative: <b className="text-rose-400">-{currentQ.negativeMarks}</b>
            </div>
          </div>

          {/* Question Statement */}
          <div className="text-slate-100 text-base leading-relaxed mb-8 font-sans whitespace-pre-wrap">
            {currentQ.text}
          </div>

          {/* Options Display (MCQ / MSQ / NAT) */}
          <div className="space-y-3 flex-1">
            {currentQ.type === 'NAT' ? (
              <div className="max-w-xs space-y-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Numerical Answer Input:
                </label>
                <input
                  type="number"
                  step="any"
                  value={selectedAnswers[currentQ.id] || ''}
                  onChange={e => handleNATChange(e.target.value)}
                  placeholder="Enter numerical answer"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-emerald-400 font-mono focus:outline-none focus:border-indigo-500"
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
                    className={`w-full text-left p-4 rounded-xl border transition-all flex items-center space-x-4 ${
                      isSelected
                        ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md'
                        : 'glass-card border-slate-800 text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                        isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {String.fromCharCode(65 + optIdx)}
                    </div>
                    <span className="text-sm">{opt.text}</span>
                  </button>
                );
              })
            )}
          </div>

          {/* Bottom Control Bar */}
          <div className="pt-6 border-t border-slate-800 flex justify-between items-center mt-auto">
            <div className="space-x-3">
              <button
                onClick={handleMarkForReviewAndNext}
                className="px-4 py-2.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-bold rounded-xl"
              >
                Mark for Review & Next
              </button>
              <button
                onClick={handleClearResponse}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-bold rounded-xl"
              >
                Clear Response
              </button>
            </div>

            <div className="space-x-3 flex items-center">
              <button
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex(prev => prev - 1)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-xs font-bold rounded-xl flex items-center space-x-1"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>
              <button
                onClick={handleSaveAndNext}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center space-x-1"
              >
                <span>Save & Next</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Sidebar: TCS Question Palette */}
        <QuestionPalette
          questions={questions}
          currentIndex={currentIndex}
          onSelectQuestion={idx => setCurrentIndex(idx)}
          onSubmitExam={handleFinalSubmit}
        />
      </div>
    </div>
  );
}
