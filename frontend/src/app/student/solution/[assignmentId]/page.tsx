'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle, XCircle, Clock, BookOpen, Award } from 'lucide-react';
import api from '@/lib/api';

export default function SolutionReviewPage() {
  const router = useRouter();
  const params = useParams();
  const assignmentId = params.assignmentId as string;

  const [data, setData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSolutions();
  }, []);

  const fetchSolutions = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await api.get(`/exam/solution/${assignmentId}`);

      if (res.data?.success) {
        setData(res.data.data);
      }
    } catch (err: any) {
      console.error('Error fetching solutions:', err);
      setErrorMsg(err.response?.data?.message || 'Failed to load solution review.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mr-3" />
        Loading Solution Review...
      </div>
    );
  }

  if (errorMsg || !data) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl max-w-md space-y-4 shadow-xl">
          <div className="text-rose-400 font-bold text-base">Unable to Load Solution Review</div>
          <p className="text-xs text-slate-300">{errorMsg || 'Solution review data not found or unauthorized.'}</p>
          <button
            onClick={() => router.push('/student/dashboard')}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30"
          >
            Back to Student Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6 max-w-5xl mx-auto">
      {/* Back Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/student/dashboard')}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 rounded-xl text-xs font-bold text-slate-300 flex items-center space-x-2 border border-slate-800"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </button>
        <h1 className="text-xl font-bold text-white tracking-tight">{data.testTitle} - Official Solution Review</h1>
      </div>

      {/* Score Summary Banner */}
      <div className="glass-panel p-6 rounded-2xl border border-indigo-500/30 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30">
            <Award className="w-8 h-8" />
          </div>
          <div>
            <div className="text-xs text-slate-400 uppercase font-semibold">Your Final Score</div>
            <div className="text-3xl font-bold text-white">
              {data.score} / <span className="text-slate-400 text-lg">{data.totalMarks}</span>
            </div>
          </div>
        </div>

        <div className="flex space-x-8 text-right">
          <div>
            <div className="text-xs text-slate-400 uppercase font-semibold">Accuracy</div>
            <div className="text-2xl font-bold text-emerald-400">{data.accuracy}%</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 uppercase font-semibold">Time Taken</div>
            <div className="text-2xl font-bold text-indigo-400">{Math.round(data.timeTakenSec / 60)} mins</div>
          </div>
        </div>
      </div>

      {/* Questions Breakdown */}
      <div className="space-y-6">
        {data.solutions.map((q: any) => (
          <div key={q.id} className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <span className="font-bold text-indigo-400">Q{q.order}.</span>
                <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-slate-900 text-slate-300">
                  {q.type}
                </span>
                <span className="text-xs text-slate-400 font-mono">{q.subject} → {q.topic}</span>
              </div>
              <div className="flex items-center space-x-2">
                {q.isCorrect ? (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle className="w-3.5 h-3.5 mr-1" /> Correct (+{q.marksObtained})
                  </span>
                ) : (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    <XCircle className="w-3.5 h-3.5 mr-1" /> Incorrect ({q.marksObtained})
                  </span>
                )}
              </div>
            </div>

            <div className="text-slate-100 text-sm leading-relaxed">{q.text}</div>

            {/* Answer Details */}
            <div className="grid grid-cols-2 gap-4 text-xs font-mono pt-2">
              <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                <span className="text-slate-500 block mb-1">Your Selected Response:</span>
                <span className={q.isCorrect ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {q.chosenAnswer !== null && q.chosenAnswer !== undefined ? JSON.stringify(q.chosenAnswer) : 'Not Answered'}
                </span>
              </div>

              <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                <span className="text-slate-500 block mb-1">Official Correct Answer:</span>
                <span className="text-emerald-400 font-bold">{JSON.stringify(q.correctAnswer)}</span>
              </div>
            </div>

            {/* Explanation Box */}
            {q.explanation && (
              <div className="bg-indigo-950/40 border border-indigo-500/20 rounded-xl p-4 space-y-1">
                <div className="text-xs font-bold text-indigo-400 flex items-center">
                  <BookOpen className="w-3.5 h-3.5 mr-1.5" /> Step-by-Step Explanation & Concept
                </div>
                <p className="text-xs text-slate-300 leading-relaxed font-sans">{q.explanation}</p>
                {q.reference && (
                  <div className="text-[11px] text-slate-500 italic pt-1">Reference: {q.reference}</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
