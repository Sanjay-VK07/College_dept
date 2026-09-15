'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  Calculator,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  Eye,
  FileText,
  Sparkles,
  Loader2,
  RefreshCw,
  Edit3,
  Layers,
} from 'lucide-react';
import api from '@/lib/api';
import { aiService } from '@/services/aiService';
import { GateScientificCalculator } from '@/components/exam/GateScientificCalculator';
import { QuestionPalette } from '@/components/exam/QuestionPalette';

export interface ExamPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  mockTestId?: string | null;
  initialMockTest?: any;
  initialQuestions?: any[];
  initialValidation?: any;
  onPublished?: () => void;
  onEditDraft?: () => void;
}

export const ExamPreviewModal: React.FC<ExamPreviewModalProps> = ({
  isOpen,
  onClose,
  mockTestId,
  initialMockTest,
  initialQuestions,
  initialValidation,
  onPublished,
  onEditDraft,
}) => {
  const [activeTab, setActiveTab] = useState<'STUDENT_PREVIEW' | 'ADMIN_REVIEW'>('STUDENT_PREVIEW');
  const [mockTest, setMockTest] = useState<any>(initialMockTest || null);
  const [questions, setQuestions] = useState<any[]>(initialQuestions || []);
  const [validation, setValidation] = useState<any>(initialValidation || null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Student Preview interactive state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, any>>({});
  const [isCalcOpen, setIsCalcOpen] = useState(false);

  // Publish Modal state
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);

  useEffect(() => {
    if (isOpen && mockTestId && !initialMockTest) {
      loadPreviewData(mockTestId);
    } else if (isOpen && initialMockTest) {
      setMockTest(initialMockTest);
      if (initialQuestions) setQuestions(initialQuestions);
      if (initialValidation) setValidation(initialValidation);
    }
  }, [isOpen, mockTestId, initialMockTest]);

  const loadPreviewData = async (testId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await aiService.getExamPreview(testId);
      if (res.success) {
        setMockTest(res.mockTest);
        setQuestions(res.questions || res.mockTest?.testQuestions || []);
        setValidation(res.validation);
      } else {
        setError(res.message || 'Failed to load examination preview.');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Error loading examination preview.');
    } finally {
      setLoading(false);
    }
  };

  const handleRevalidate = async () => {
    if (!mockTest?.id) return;
    setLoading(true);
    try {
      const res = await aiService.validateExam(mockTest.id);
      if (res.success) {
        setValidation(res.validation);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error running validation.');
    } finally {
      setLoading(false);
    }
  };

  const handlePublishConfirm = async () => {
    if (!mockTest?.id) return;
    setIsPublishing(true);
    setError(null);
    try {
      const res = await aiService.publishExamination(mockTest.id);
      if (res.success) {
        setPublishSuccess(true);
        setMockTest((prev: any) => ({ ...prev, isPublished: true, status: 'PUBLISHED' }));
        setIsPublishModalOpen(false);
        if (onPublished) onPublished();
      } else {
        setError(res.message || 'Failed to publish examination.');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Error publishing examination.');
    } finally {
      setIsPublishing(false);
    }
  };

  if (!isOpen) return null;

  // Extract question objects from testQuestions wrappers if needed
  const normalizedQuestions = questions.map((tq: any, idx: number) => {
    const q = tq.question || tq;
    const qv = tq.questionVersion;
    const qId = q.id || tq.questionId || `q_${idx}`;
    const ans = selectedAnswers[qId];
    const hasAns = ans !== undefined && ans !== null && ans !== '' && (!Array.isArray(ans) || ans.length > 0);

    return {
      id: qId,
      customId: q.customId,
      text: qv?.text || q.text || '',
      type: qv?.type || q.type || 'MCQ',
      difficulty: qv?.difficulty || q.difficulty || 'MEDIUM',
      marks: qv?.marks ?? q.marks ?? 1.0,
      negativeMarks: qv?.negativeMarks ?? q.negativeMarks ?? 0.33,
      options: qv?.options || q.options || [],
      correctAnswer: qv?.correctAnswer ?? q.correctAnswer,
      verificationStatus: q.verificationStatus || 'VERIFIED',
      origin: q.origin || 'SOURCE',
      imageUrl: qv?.imageUrl || q.imageUrl,
      containsFigure: q.containsFigure,
      subtopic: q.subtopic,
      sourceDocument: q.sourceDocument,
      order: tq.order || idx + 1,
      questionVersionId: tq.questionVersionId,
      status: (hasAns ? 'ANSWERED' : idx === currentIndex ? 'VISITED' : 'NOT_VISITED') as
        | 'NOT_VISITED'
        | 'VISITED'
        | 'ANSWERED'
        | 'SKIPPED'
        | 'MARKED_FOR_REVIEW'
        | 'ANSWERED_AND_MARKED',
    };
  });

  const currentQ = normalizedQuestions[currentIndex] || null;

  const handleOptionSelect = (optIdx: number) => {
    if (!currentQ) return;
    let newAns: any;
    if (currentQ.type === 'MCQ') {
      newAns = [optIdx];
    } else if (currentQ.type === 'MSQ') {
      const existing = (selectedAnswers[currentQ.id] as number[]) || [];
      if (existing.includes(optIdx)) {
        newAns = existing.filter((i) => i !== optIdx);
      } else {
        newAns = [...existing, optIdx];
      }
    }
    setSelectedAnswers((prev) => ({ ...prev, [currentQ.id]: newAns }));
  };

  const handleNATChange = (val: string) => {
    if (!currentQ) return;
    setSelectedAnswers((prev) => ({ ...prev, [currentQ.id]: val }));
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex flex-col overflow-hidden font-sans">
      {/* Top Navigation & Status Bar */}
      <header className="bg-slate-900 text-white px-6 py-3 border-b border-slate-800 flex items-center justify-between shrink-0 shadow-lg">
        <div className="flex items-center space-x-4">
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Close Preview"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-base font-bold text-white tracking-tight">
                {mockTest?.title || 'Examination Preview'}
              </h1>
              {mockTest?.isPublished ? (
                <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  🟢 PUBLISHED
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  🟡 DRAFT (Invisible to Students)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Target: <b className="text-slate-200">{mockTest?.targetDepartment || 'All Departments'}</b> | Duration:{' '}
              <b className="text-slate-200">{mockTest?.durationMinutes || 180} mins</b> | Questions:{' '}
              <b className="text-slate-200">{normalizedQuestions.length}</b> | Total Marks:{' '}
              <b className="text-slate-200">{mockTest?.totalMarks || 100}</b>
            </p>
          </div>
        </div>

        {/* Action Controls & Tab Switcher */}
        <div className="flex items-center space-x-3">
          {/* Mode Switcher */}
          <div className="bg-slate-800 p-1 rounded-lg border border-slate-700 flex space-x-1">
            <button
              onClick={() => setActiveTab('STUDENT_PREVIEW')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-1.5 transition-all ${
                activeTab === 'STUDENT_PREVIEW'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Student Preview</span>
            </button>
            <button
              onClick={() => setActiveTab('ADMIN_REVIEW')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-1.5 transition-all ${
                activeTab === 'ADMIN_REVIEW'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Admin Question Review</span>
            </button>
          </div>

          <button
            onClick={handleRevalidate}
            disabled={loading}
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Re-run Pre-Publish Validation"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Validate</span>
          </button>

          {onEditDraft && (
            <button
              onClick={() => {
                onClose();
                onEditDraft();
              }}
              className="px-3.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Exam</span>
            </button>
          )}

          {!mockTest?.isPublished && (
            <button
              onClick={() => setIsPublishModalOpen(true)}
              disabled={validation && !validation.canPublish}
              className={`px-4 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition-all ${
                validation && !validation.canPublish
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed border border-slate-600'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
              }`}
              title={validation && !validation.canPublish ? 'Fix blocking validation errors to enable publishing' : 'Publish Examination'}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Publish Examination</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-100">
        {/* Error Notice */}
        {error && (
          <div className="bg-red-600 text-white px-6 py-2 text-xs font-medium flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-white hover:underline text-[11px]">
              Dismiss
            </button>
          </div>
        )}

        {/* Validation Status Summary Header Banner */}
        {validation && (
          <div className="bg-white border-b border-slate-200 px-6 py-3 shrink-0 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center space-x-4">
                {validation.canPublish ? (
                  <div className="flex items-center space-x-2 text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>PRE-PUBLISH VALIDATION PASSED — READY TO PUBLISH</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2 text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <span>CANNOT PUBLISH — {validation.blocking.length} BLOCKING ISSUE(S) REQUIRE ATTENTION</span>
                  </div>
                )}

                <div className="flex items-center space-x-2 text-xs text-slate-600">
                  <span className="erp-badge-gray">
                    SOURCE: <b>{validation.summary?.sourceCount ?? 0}</b>
                  </span>
                  <span className="erp-badge-gray">
                    AI: <b>{validation.summary?.aiGeneratedCount ?? 0}</b>
                  </span>
                  <span className="erp-badge-gray">
                    Figures: <b>{validation.summary?.figureCount ?? 0}</b>
                  </span>
                  <span className="erp-badge-gray">
                    MCQ: <b>{validation.summary?.mcqCount ?? 0}</b> | MSQ: <b>{validation.summary?.msqCount ?? 0}</b> | NAT:{' '}
                    <b>{validation.summary?.natCount ?? 0}</b>
                  </span>
                </div>
              </div>

              {!validation.canPublish && (
                <div className="text-xs text-red-700 font-semibold flex items-center gap-2">
                  <span>Fix blocking errors below to enable publication</span>
                </div>
              )}
            </div>

            {/* Validation Breakdown Accordion / Alert Details */}
            {validation.blocking.length > 0 && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-800 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-red-900">
                  <X className="w-4 h-4 text-red-600" />
                  <span>Blocking Validation Errors (Must be resolved before publishing):</span>
                </div>
                <ul className="list-disc pl-5 space-y-0.5 font-medium">
                  {validation.blocking.map((msg: string, i: number) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}

            {validation.warnings.length > 0 && (
              <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-900">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Quality Warnings (Advisory — does not block publishing):</span>
                </div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {validation.warnings.map((msg: string, i: number) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Tab 1: Student Examination Preview */}
        {activeTab === 'STUDENT_PREVIEW' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-[#F8FAFC]">
            {/* Gate Scientific Calculator Modal */}
            <GateScientificCalculator isOpen={isCalcOpen} onClose={() => setIsCalcOpen(false)} />

            {/* Student Exam Navbar Preview */}
            <header className="bg-[#1E40AF] text-white border-b border-blue-900 px-6 py-2.5 flex items-center justify-between z-20 shadow-sm shrink-0">
              <div className="flex items-center space-x-3">
                <div className="font-bold text-white text-base">{mockTest?.title || 'Mock Examination'}</div>
                <span className="erp-badge-blue bg-white/10 text-white border-white/20">
                  {currentQ?.subtopic?.topic?.module?.subject?.name || 'Gate Exam'}
                </span>
              </div>

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
                  <span>Time Left: {formatTimer((mockTest?.durationMinutes || 180) * 60)}</span>
                </div>

                <div className="text-right border-l border-blue-800 pl-4 hidden sm:block">
                  <div className="text-xs font-bold text-white">Faculty Preview Mode</div>
                  <div className="text-[10px] text-blue-200 font-mono">Sample Student View</div>
                </div>
              </div>
            </header>

            {/* Main CBT Question Work Area */}
            {normalizedQuestions.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-12 text-center text-slate-500">
                <div>
                  <AlertCircle className="w-10 h-10 mx-auto text-slate-400 mb-2" />
                  <p className="text-sm font-semibold">No questions attached to this draft examination.</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex overflow-hidden">
                {/* Left Question & Answer Area */}
                <div className="flex-1 flex flex-col p-6 overflow-y-auto bg-white">
                  {currentQ && (
                    <>
                      {/* Question Header Metadata */}
                      <div className="flex justify-between items-center pb-3 border-b border-slate-200 mb-6 shrink-0">
                        <div className="flex items-center space-x-3">
                          <span className="text-lg font-bold text-[#1E40AF]">Question {currentIndex + 1}</span>
                          <span className="erp-badge-gray">{currentQ.type}</span>
                          <span className="erp-badge-gray">Difficulty: {currentQ.difficulty}</span>
                          {currentQ.origin === 'AI_GENERATED' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-purple-600" />
                              AI_GENERATED
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-mono text-slate-600">
                          Marks: <b className="text-emerald-700">+{currentQ.marks}</b> | Negative:{' '}
                          <b className="text-red-700">-{currentQ.negativeMarks}</b>
                        </div>
                      </div>

                      {/* Question Statement & Markdown Image Parsing */}
                      <div className="text-slate-900 text-base leading-relaxed mb-6 whitespace-pre-wrap font-medium">
                        {(() => {
                          const text = currentQ.text;
                          const imgRegex = /!\[.*?\]\((.*?)\)/;
                          const match = text.match(imgRegex);
                          if (match) {
                            const imageUrl = match[1];
                            const cleanText = text.replace(imgRegex, '').trim();
                            return (
                              <div className="space-y-4">
                                <div>{cleanText}</div>
                                <div className="flex justify-center p-4 bg-slate-50 border border-slate-200 rounded-lg">
                                  <img src={imageUrl} alt="Question Diagram" className="max-h-72 object-contain" />
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div className="space-y-4">
                              <div>{text}</div>
                              {currentQ.imageUrl && (
                                <div className="flex justify-center p-4 bg-slate-50 border border-slate-200 rounded-lg">
                                  <img src={currentQ.imageUrl} alt="Question Diagram" className="max-h-72 object-contain" />
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Options Entry Area */}
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
                                <span className="text-sm font-medium">{opt.text || opt}</span>
                              </button>
                            );
                          })
                        )}
                      </div>

                      {/* Navigation Controls */}
                      <div className="pt-4 border-t border-slate-200 flex justify-between items-center mt-auto shrink-0">
                        <div className="space-x-2">
                          <button
                            onClick={() => {
                              if (currentIndex < normalizedQuestions.length - 1) setCurrentIndex((p) => p + 1);
                            }}
                            className="erp-btn-secondary py-2 text-xs"
                          >
                            Mark for Review & Next
                          </button>
                          <button
                            onClick={() => {
                              setSelectedAnswers((prev) => {
                                const copy = { ...prev };
                                delete copy[currentQ.id];
                                return copy;
                              });
                            }}
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
                            disabled={currentIndex === normalizedQuestions.length - 1}
                            onClick={() => setCurrentIndex((prev) => prev + 1)}
                            className="erp-btn-primary py-2 text-xs"
                          >
                            <span>Save & Next</span>
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Right Question Palette */}
                <QuestionPalette
                  questions={normalizedQuestions}
                  currentIndex={currentIndex}
                  onSelectQuestion={(idx) => setCurrentIndex(idx)}
                  onSubmitExam={() => setIsPublishModalOpen(true)}
                />
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Admin Question Review Table View */}
        {activeTab === 'ADMIN_REVIEW' && (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto bg-slate-50">
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
              <header className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    Question Paper Review Matrix ({normalizedQuestions.length} Questions)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Review verification status, origins, figures, and points frozen in QuestionVersion snapshots.
                  </p>
                </div>

                <div className="text-xs text-slate-600 font-mono">
                  Total Marks: <b className="text-emerald-700 font-bold">{mockTest?.totalMarks || 100}</b>
                </div>
              </header>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 text-left sticky top-0 font-bold">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Question ID / Stem</th>
                      <th className="px-4 py-3">Topic</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Marks</th>
                      <th className="px-4 py-3">Origin</th>
                      <th className="px-4 py-3">Verification Status</th>
                      <th className="px-4 py-3">Source Ref</th>
                      <th className="px-4 py-3">Figure Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {normalizedQuestions.map((q: any, idx: number) => {
                      const figDet = validation?.figureDetails?.find((f: any) => f.questionIndex === idx + 1);

                      return (
                        <tr key={q.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 font-mono font-bold text-slate-600">{idx + 1}</td>
                          <td className="px-4 py-3 font-medium text-slate-900 max-w-sm" title={q.text}>
                            {q.customId && <span className="font-mono text-blue-700 font-bold mr-1">[{q.customId}]</span>}
                            <span className="line-clamp-2">{q.text}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {q.subtopic?.topic?.name || q.subtopic?.name || 'General'}
                          </td>
                          <td className="px-4 py-3 font-mono font-semibold text-slate-800">{q.type}</td>
                          <td className="px-4 py-3 font-mono">
                            <span className="text-emerald-700 font-bold">+{q.marks}</span> /{' '}
                            <span className="text-red-700">-{q.negativeMarks}</span>
                          </td>
                          <td className="px-4 py-3">
                            {q.origin === 'AI_GENERATED' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200 inline-flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-purple-600" />
                                AI_GENERATED
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                SOURCE
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {q.verificationStatus === 'VERIFIED' ? (
                              <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                VERIFIED
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-800 border border-red-300 inline-flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                                {q.verificationStatus || 'NEEDS_REVIEW'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                            {q.sourceDocument?.title || (q.sourceDocument?.fileName ? `Doc: ${q.sourceDocument.fileName}` : '—')}
                          </td>
                          <td className="px-4 py-3">
                            {figDet?.hasFigure ? (
                              figDet.isValid ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  ✓ OK ({figDet.figureUrl?.split('/').pop() || 'Diagram'})
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-300">
                                  ❌ MISSING FIGURE
                                </span>
                              )
                            ) : (
                              <span className="text-slate-400 font-mono text-[11px]">No figure</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Publish Confirmation Modal */}
      {isPublishModalOpen && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
            <header className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold">Publish Examination?</h3>
              </div>
              <button onClick={() => setIsPublishModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="p-6 space-y-4 text-xs text-slate-700">
              {publishSuccess ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 space-y-2">
                  <div className="font-bold text-sm flex items-center gap-2 text-emerald-800">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>✓ Examination Published Successfully!</span>
                  </div>
                  <p className="text-xs text-emerald-700 leading-relaxed">
                    "{mockTest?.title}" is now published and available to students according to its configured schedule.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-slate-600 leading-relaxed">
                    You are about to publish <b>{mockTest?.title}</b>. Once published, the exam becomes available to target students according to schedule.
                  </p>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1.5 font-mono text-[11px] text-slate-800">
                    <div>Questions: <b>{normalizedQuestions.length}</b></div>
                    <div>Total Marks: <b>{mockTest?.totalMarks || 100}</b></div>
                    <div>Duration: <b>{mockTest?.durationMinutes || 180} minutes</b></div>
                    <div>Target Cohort: <b>{mockTest?.targetDepartment || 'All Departments'}</b></div>
                  </div>

                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-900 flex items-start space-x-2 text-[11px]">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      <b>Question Set Freeze:</b> Publishing locks all question snapshots. Edits to Question Bank items will not modify this published exam paper.
                    </span>
                  </div>
                </>
              )}
            </div>

            <footer className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              {publishSuccess ? (
                <button
                  onClick={() => {
                    setIsPublishModalOpen(false);
                    onClose();
                  }}
                  className="erp-btn-primary py-2 text-xs font-bold"
                >
                  Close &amp; Return
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setIsPublishModalOpen(false)}
                    disabled={isPublishing}
                    className="erp-btn-secondary py-2 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePublishConfirm}
                    disabled={isPublishing}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isPublishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    <span>{isPublishing ? 'Publishing...' : 'Confirm & Publish'}</span>
                  </button>
                </>
              )}
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};
