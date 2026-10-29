'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle, XCircle, BookOpen, Award, Clock, Calendar, ShieldCheck } from 'lucide-react';
import api from '@/lib/api';
import { QuestionRenderer } from '@/components/question-bank/QuestionRenderer';

function formatAnswerDisplay(answer: any, options?: any[], questionType?: string): string {
  if (answer === null || answer === undefined || answer === '') return 'Not Attempted';

  const isNat =
    questionType === 'NAT' ||
    (typeof answer === 'object' &&
      answer !== null &&
      ('acceptedRanges' in answer || 'range' in answer || ('min' in answer && 'max' in answer)));

  if (isNat) {
    if (typeof answer === 'object' && answer !== null) {
      if (Array.isArray(answer.acceptedRanges) && answer.acceptedRanges.length > 0) {
        return answer.acceptedRanges
          .map((r: any) => {
            const min = r.min ?? r.range?.from ?? r.range?.[0];
            const max = r.max ?? r.range?.to ?? r.range?.[1];
            if (min !== undefined && max !== undefined) {
              return min === max ? String(min) : `[${min} to ${max}]`;
            }
            if (r.value !== undefined) return String(r.value);
            return JSON.stringify(r);
          })
          .join(' or ');
      }
      if (answer.min !== undefined && answer.max !== undefined) {
        if (answer.min === answer.max) return String(answer.min);
        return `[${answer.min} to ${answer.max}]`;
      }
      if (answer.range && typeof answer.range === 'object') {
        const from = answer.range.from ?? answer.range[0];
        const to = answer.range.to ?? answer.range[1];
        if (from !== undefined && to !== undefined) {
          if (from === to) return String(from);
          return `[${from} to ${to}]`;
        }
      }
      if (answer.value !== undefined) {
        return String(answer.value);
      }
      return JSON.stringify(answer);
    }
    return String(answer);
  }

  const formatSingleOption = (val: any) => {
    // Only map integer indices to Option (A-D) if this is confirmed to be MCQ/MSQ
    const isMcqOrMsq = questionType === 'MCQ' || questionType === 'MSQ';

    if (typeof val === 'number') {
      if (isMcqOrMsq && Number.isInteger(val) && val >= 0 && val < 26) {
        return `Option (${String.fromCharCode(65 + val)})`;
      }
      return String(val);
    }
    if (typeof val === 'string') {
      const clean = val.trim().toUpperCase();
      if (/^[0-9]+$/.test(clean) && isMcqOrMsq) {
        const num = parseInt(clean, 10);
        if (num >= 0 && num < 26) {
          return `Option (${String.fromCharCode(65 + num)})`;
        }
      }
      if (/^[A-E]$/.test(clean)) {
        return `Option (${clean})`;
      }
      return val;
    }
    if (typeof val === 'object' && val !== null && 'value' in val) {
      return formatSingleOption(val.value);
    }
    return String(val);
  };

  if (Array.isArray(answer)) {
    if (answer.length === 0) return 'Not Attempted';
    return answer.map(formatSingleOption).join(', ');
  }

  return formatSingleOption(answer);
}

export default function SolutionReviewPage({ params }: { params?: any }) {
  const router = useRouter();
  const routeParams = useParams();

  const initialParamId =
    params && typeof params === 'object' && !('then' in params)
      ? params.assignmentId
      : (routeParams?.assignmentId as string);

  const [assignmentId, setAssignmentId] = useState<string>(initialParamId || '');
  const [data, setData] = useState<any>(null);
  const [pendingData, setPendingData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<'ALL' | 'ATTEMPTED' | 'CORRECT' | 'WRONG' | 'UNANSWERED'>('ALL');

  useEffect(() => {
    if (params && typeof params === 'object' && 'then' in params) {
      Promise.resolve(params).then((resolved) => {
        if (resolved?.assignmentId) {
          setAssignmentId(resolved.assignmentId);
        }
      });
    } else if (routeParams?.assignmentId) {
      setAssignmentId(routeParams.assignmentId as string);
    } else if (params?.assignmentId) {
      setAssignmentId(params.assignmentId);
    }
  }, [params, routeParams]);

  useEffect(() => {
    if (!assignmentId) return;

    let isMounted = true;

    const fetchSolutions = async () => {
      setLoading(true);
      setErrorMsg('');
      try {
        console.log('Fetching solutions for assignmentId:', assignmentId);
        const res = await api.get(`/exam/solution/${assignmentId}`);
        console.log('Solutions API response:', res.data);
        if (isMounted && res.data?.success) {
          setData(res.data.data);
          setPendingData(null);
        }
      } catch (err: any) {
        console.error('Error fetching solutions:', err);
        if (isMounted) {
          if (err.response?.data?.code === 'RESULT_NOT_YET_VISIBLE') {
            setPendingData(err.response?.data?.data || {
              message: err.response?.data?.message,
            });
            setErrorMsg('');
          } else {
            setErrorMsg(err.response?.data?.message || 'Failed to load solution review.');
          }
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

  // Graceful Results Pending Release Status
  if (pendingData) {
    const formattedReleaseDate = pendingData.releaseDate
      ? new Date(pendingData.releaseDate).toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      : null;

    const formattedSubmittedAt = pendingData.submittedAt
      ? new Date(pendingData.submittedAt).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      : null;

    return (
      <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-sans">
        {/* Top Navbar */}
        <header className="bg-[#1E40AF] text-white border-b border-blue-900 px-6 py-3.5 sticky top-0 z-30 shadow-sm">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => router.push('/student/dashboard')}
                className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-md transition-colors"
                title="Back to Dashboard"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h1 className="text-base font-bold text-white">
                  {pendingData.testTitle || 'Official Examination'}
                </h1>
                <p className="text-xs text-blue-200">Central University Examination Portal</p>
              </div>
            </div>

            <span className="erp-badge-amber font-mono text-xs">
              Results Pending Release
            </span>
          </div>
        </header>

        {/* Main Status Container */}
        <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 flex flex-col items-center justify-center">
          <div className="erp-card max-w-xl w-full p-6 sm:p-8 space-y-6 bg-white border border-slate-200 shadow-sm text-center">
            {/* Status Icon */}
            <div className="mx-auto w-16 h-16 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center text-[#1E40AF]">
              <Clock className="w-8 h-8" />
            </div>

            {/* Header */}
            <div className="space-y-1.5">
              <span className="erp-badge-green font-mono text-xs">
                Submission Confirmed
              </span>
              <h2 className="text-xl font-bold text-slate-900 pt-1">
                Examination Completed Successfully
              </h2>
              <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                Results for this examination are not yet available. Please check back once they are released.
              </p>
            </div>

            {/* Details Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-left space-y-2.5 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-500 font-medium">Examination:</span>
                <span className="font-bold text-slate-900">{pendingData.testTitle || 'CBT Assessment'}</span>
              </div>
              {formattedSubmittedAt && (
                <div className="flex justify-between items-center py-1 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Submitted At:</span>
                  <span className="font-mono text-slate-800">{formattedSubmittedAt}</span>
                </div>
              )}
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-500 font-medium">Evaluation Status:</span>
                <span className="font-semibold text-emerald-700">Responses Saved & Secured</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-500 font-medium">Scheduled Result Release:</span>
                <span className="font-mono font-semibold text-[#1E40AF]">
                  {formattedReleaseDate ? formattedReleaseDate : 'Pending Official Declaration'}
                </span>
              </div>
            </div>

            {/* Integrity Notice */}
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-md text-[11px] text-amber-900 text-left leading-relaxed">
              <strong>Institutional Assessment Policy:</strong> To maintain test security and integrity for all examinees, detailed marks, correct answer keys, and question explanations remain confidential until the examination window concludes or results are published by the Controller of Examinations.
            </div>

            {/* Actions */}
            <div className="pt-2">
              <button
                onClick={() => router.push('/student/dashboard')}
                className="erp-btn-primary w-full py-2.5 text-xs font-semibold"
              >
                Back to Student Dashboard
              </button>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="bg-white border-t border-slate-200 py-3 px-6 text-center text-xs text-slate-500 mt-auto">
          Central University Examination Portal • Controller of Examinations
        </footer>
      </div>
    );
  }

  // Error fallback
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
  const totalQuestions = data.totalQuestions ?? solutionsList.length;
  const attemptedCount =
    data.attemptedCount ??
    solutionsList.filter((q: any) => q.chosenAnswer !== null && q.chosenAnswer !== undefined && q.chosenAnswer !== '').length;
  const correctCount = data.correctCount ?? solutionsList.filter((q: any) => q.isCorrect).length;
  const wrongCount =
    data.wrongCount ??
    solutionsList.filter((q: any) => q.chosenAnswer !== null && q.chosenAnswer !== undefined && q.chosenAnswer !== '' && !q.isCorrect).length;
  const unansweredCount = data.unansweredCount ?? Math.max(0, totalQuestions - attemptedCount);

  const filteredSolutions = solutionsList.filter((q: any) => {
    const isAttempted = q.chosenAnswer !== null && q.chosenAnswer !== undefined && q.chosenAnswer !== '';
    if (filterMode === 'ATTEMPTED') return isAttempted;
    if (filterMode === 'CORRECT') return q.isCorrect;
    if (filterMode === 'WRONG') return isAttempted && !q.isCorrect;
    if (filterMode === 'UNANSWERED') return !isAttempted;
    return true;
  });

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
        <div className="erp-card bg-white border-l-4 border-l-[#1E40AF] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-blue-50 text-[#1E40AF] rounded-md border border-blue-100 shrink-0">
              <Award className="w-8 h-8" />
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

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t md:border-t-0 md:border-l border-slate-200 pt-3 md:pt-0 md:pl-6 text-center">
            <div className="p-2 bg-slate-50 rounded border border-slate-200">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Accuracy</div>
              <div className="text-lg font-bold text-emerald-700">
                {data.accuracy !== null && data.accuracy !== undefined ? `${data.accuracy}%` : '--'}
              </div>
            </div>
            <div className="p-2 bg-slate-50 rounded border border-slate-200">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Correct</div>
              <div className="text-lg font-bold text-emerald-700">{correctCount}</div>
            </div>
            <div className="p-2 bg-slate-50 rounded border border-slate-200">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Incorrect</div>
              <div className="text-lg font-bold text-red-600">{wrongCount}</div>
            </div>
            <div className="p-2 bg-slate-50 rounded border border-slate-200">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Time Taken</div>
              <div className="text-lg font-bold text-[#1E40AF]">
                {data.timeTakenSec !== null && data.timeTakenSec !== undefined ? `${Math.round(data.timeTakenSec / 60)}m` : '--'}
              </div>
            </div>
          </div>
        </div>

        {/* Filter Tabs for Review of Attempted Questions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              onClick={() => setFilterMode('ALL')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                filterMode === 'ALL'
                  ? 'bg-[#1E40AF] text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              All Questions ({totalQuestions})
            </button>
            <button
              onClick={() => setFilterMode('ATTEMPTED')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                filterMode === 'ATTEMPTED'
                  ? 'bg-[#1E40AF] text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Attempted ({attemptedCount})
            </button>
            <button
              onClick={() => setFilterMode('CORRECT')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                filterMode === 'CORRECT'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              Correct ({correctCount})
            </button>
            <button
              onClick={() => setFilterMode('WRONG')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                filterMode === 'WRONG'
                  ? 'bg-rose-700 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-rose-700 hover:bg-rose-50'
              }`}
            >
              Incorrect ({wrongCount})
            </button>
            <button
              onClick={() => setFilterMode('UNANSWERED')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                filterMode === 'UNANSWERED'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Unanswered ({unansweredCount})
            </button>
          </div>

          <span className="text-xs text-slate-500 font-medium">
            Showing {filteredSolutions.length} of {totalQuestions} questions
          </span>
        </div>

        {/* Questions Breakdown */}
        <div className="space-y-4">
          {filteredSolutions.length === 0 ? (
            <div className="erp-card text-center py-12 text-slate-500 text-xs font-mono">
              No questions found for the selected filter ({filterMode}).
            </div>
          ) : (
            filteredSolutions.map((q: any) => (
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
                    ) : q.chosenAnswer === null || q.chosenAnswer === undefined || q.chosenAnswer === '' ? (
                      <span className="erp-badge-gray">
                        <XCircle className="w-3.5 h-3.5 mr-1" /> Not Attempted (0)
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
                    <span className={q.isCorrect ? 'text-emerald-700 font-bold' : (q.chosenAnswer === null || q.chosenAnswer === undefined || q.chosenAnswer === '') ? 'text-slate-500' : 'text-red-700 font-bold'}>
                      {formatAnswerDisplay(q.chosenAnswer, q.options, q.type)}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                    <span className="text-slate-500 block mb-1 uppercase text-[10px] font-semibold">Official Answer Key:</span>
                    <span className="text-emerald-700 font-bold">
                      {q.correctAnswer !== undefined ? formatAnswerDisplay(q.correctAnswer, q.options, q.type) : 'Withheld / Confidential'}
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
