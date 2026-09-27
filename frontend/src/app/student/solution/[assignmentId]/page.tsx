'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle, XCircle, BookOpen, Award } from 'lucide-react';
import api from '@/lib/api';
import { QuestionRenderer } from '@/components/question-bank/QuestionRenderer';

export default function SolutionReviewPage({ params }: { params?: { assignmentId?: string } }) {
  const router = useRouter();
  const routeParams = useParams();
  const assignmentId = params?.assignmentId || (routeParams?.assignmentId as string);

  const [data, setData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!assignmentId) return;

    let isMounted = true;

    const fetchSolutions = async () => {
      setLoading(true);
      setErrorMsg('');
      try {
        const res = await api.get(`/exam/solution/${assignmentId}`);
        if (isMounted && res.data?.success) {
          setData(res.data.data);
        }
      } catch (err: any) {
        console.error('Error fetching solutions:', err);
        if (isMounted) {
          setErrorMsg(err.response?.data?.message || 'Failed to load solution review.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchSolutions();

    return () => {
      isMounted = false;
    };
  }, [assignmentId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center text-slate-600 space-y-3">
        <div className="w-8 h-8 border-3 border-[#1E40AF] border-t-transparent rounded-full animate-spin" />
        <div className="text-sm font-medium">Loading solution review...</div>
      </div>
    );
  }

  if (errorMsg || !data) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 text-center space-y-4 font-sans">
        <div className="erp-card max-w-md w-full space-y-4">
          <div className="text-red-700 font-bold text-base">Unable to Load Solution Review</div>
          <p className="text-xs text-slate-600">{errorMsg || 'No data available'}</p>
          <button
            onClick={() => router.push('/student/dashboard')}
            className="erp-btn-primary w-full text-xs"
          >
            Back to Student Dashboard
          </button>
        </div>
      </div>
    );
  }

  const solutionsList = data.solutions || [];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="bg-[#1E40AF] text-white border-b border-blue-900 px-6 py-3.5 sticky top-0 z-30 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => router.push('/student/dashboard')}
              className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-md transition-colors"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-base font-bold text-white">{data.testTitle || 'Official Solution Review'}</h1>
              <p className="text-xs text-blue-200">Official Evaluation & Solution Key</p>
            </div>
          </div>

          <span className="erp-badge-green font-mono text-xs">
            Evaluated Paper
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Score Summary Banner */}
        <div className="erp-card bg-white border-l-4 border-l-[#1E40AF] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-blue-50 text-[#1E40AF] rounded-md border border-blue-100">
              <Award className="w-7 h-7" />
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase font-semibold">Your Final Score</div>
              <div className="text-3xl font-bold text-slate-900">
                {data.score !== null && data.score !== undefined ? data.score : '--'}{' '}
                <span className="text-slate-400 text-lg font-normal">
                  / {data.totalMarks !== null && data.totalMarks !== undefined ? data.totalMarks : '--'} Marks
                </span>
              </div>
            </div>
          </div>

          <div className="flex space-x-6 border-t sm:border-t-0 sm:border-l border-slate-200 pt-3 sm:pt-0 sm:pl-6 text-right">
            <div>
              <div className="text-xs text-slate-500 uppercase font-semibold">Accuracy</div>
              <div className="text-xl font-bold text-emerald-700">
                {data.accuracy !== null && data.accuracy !== undefined ? `${data.accuracy}%` : '--'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase font-semibold">Time Taken</div>
              <div className="text-xl font-bold text-[#1E40AF]">
                {data.timeTakenSec !== null && data.timeTakenSec !== undefined ? `${Math.round(data.timeTakenSec / 60)} mins` : '--'}
              </div>
            </div>
          </div>
        </div>

        {/* Questions Breakdown */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Detailed Answer Key & Academic Explanations
          </h2>

          {solutionsList.length === 0 ? (
            <div className="erp-card text-center py-12 text-slate-500 text-xs font-mono">
              No data available
            </div>
          ) : (
            solutionsList.map((q: any) => (
              <div key={q.id || q.order} className="erp-card space-y-3">
                <div className="flex justify-between items-center pb-2.5 border-b border-slate-200">
                  <div className="flex items-center space-x-2.5">
                    <span className="font-bold text-[#1E40AF]">Question {q.order}</span>
                    <span className="erp-badge-gray">{q.type || '--'}</span>
                    <span className="text-xs text-slate-500 font-mono hidden sm:inline">
                      {q.subject || 'General'} → {q.topic || 'General'}
                    </span>
                  </div>
                  <div>
                    {q.isCorrect ? (
                      <span className="erp-badge-green">
                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> Correct (+{q.marksObtained})
                      </span>
                    ) : q.chosenAnswer === null || q.chosenAnswer === undefined ? (
                      <span className="erp-badge-gray">
                        <XCircle className="w-3.5 h-3.5 mr-1" /> Not Attempted
                      </span>
                    ) : (
                      <span className="erp-badge-red">
                        <XCircle className="w-3.5 h-3.5 mr-1" /> Incorrect ({q.marksObtained})
                      </span>
                    )}
                  </div>
                </div>

                {/* Image-First Question & Options Rendering */}
                <QuestionRenderer
                  question={q}
                  selectedAnswer={q.chosenAnswer}
                  showCorrectAnswer={true}
                  viewMode="SOLUTION_VIEW"
                />

                {/* Answer Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono pt-1">
                  <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                    <span className="text-slate-500 block mb-1 uppercase text-[10px] font-semibold">Candidate Response:</span>
                    <span className={q.isCorrect ? 'text-emerald-700 font-bold' : 'text-red-700 font-bold'}>
                      {q.chosenAnswer !== null && q.chosenAnswer !== undefined ? JSON.stringify(q.chosenAnswer) : 'Not Answered'}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                    <span className="text-slate-500 block mb-1 uppercase text-[10px] font-semibold">Official Answer Key:</span>
                    <span className="text-emerald-700 font-bold">
                      {q.correctAnswer !== null && q.correctAnswer !== undefined ? JSON.stringify(q.correctAnswer) : 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Step by step explanation */}
                {q.explanation && (
                  <div className="bg-blue-50/60 border border-blue-200 rounded-md p-3.5 space-y-1.5 text-xs">
                    <div className="font-bold text-[#1E40AF] flex items-center">
                      <BookOpen className="w-4 h-4 mr-1.5" /> Concept Explanation & Solution Steps
                    </div>
                    <p className="text-slate-700 leading-relaxed font-sans">{q.explanation}</p>
                    {q.reference && (
                      <div className="text-[11px] text-slate-500 italic pt-1">Reference: {q.reference}</div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-3 px-6 text-center text-xs text-slate-500 mt-auto">
        Office of the Controller of Examinations • Official Solution Key
      </footer>
    </div>
  );
}
