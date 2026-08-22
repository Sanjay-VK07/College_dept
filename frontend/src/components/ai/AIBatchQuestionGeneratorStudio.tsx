'use client';

import React, { useState, useEffect } from 'react';
import { aiService } from '@/services/aiService';
import {
  Sparkles,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  FileText,
  HelpCircle,
  Sliders,
  Layers,
  ShieldAlert,
  Clock,
  RefreshCw,
  Check,
  X,
  Edit,
  ExternalLink,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import api from '@/lib/api';

interface AIBatchQuestionGeneratorStudioProps {
  role?: string;
}

export const AIBatchQuestionGeneratorStudio: React.FC<AIBatchQuestionGeneratorStudioProps> = ({ role = 'FACULTY' }) => {
  // Config & Bounds
  const [minCount, setMinCount] = useState(50);
  const [maxCount, setMaxCount] = useState(500);

  // Admin-configurable generation governance settings
  const [autoPublishVerified, setAutoPublishVerified] = useState(true);
  const [maxRegenerationAttempts, setMaxRegenerationAttempts] = useState(2);
  const [savingSettings, setSavingSettings] = useState(false);

  // Form Fields
  const [totalQuestions, setTotalQuestions] = useState(50);
  const [easyPercent, setEasyPercent] = useState(20);
  const [medPercent, setMedPercent] = useState(50);
  const [hardPercent, setHardPercent] = useState(30);

  const [mcqPercent, setMcqPercent] = useState(60);
  const [msqPercent, setMsqPercent] = useState(10);
  const [natPercent, setNatPercent] = useState(30);

  const [negativeMarking, setNegativeMarking] = useState(true);
  const [solutionVisibility, setSolutionVisibility] = useState('SHOW_AFTER_RESULT');
  const [sourceReferences, setSourceReferences] = useState(true);

  // Selection
  const [availableDocs, setAvailableDocs] = useState<any[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [selectAllDocs, setSelectAllDocs] = useState(true);

  // Taxonomy
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [modules, setModules] = useState<any[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [topics, setTopics] = useState<any[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [subtopics, setSubtopics] = useState<any[]>([]);
  const [selectedSubtopicId, setSelectedSubtopicId] = useState('');

  // Generation Job State
  const [isGenerating, setIsGenerating] = useState(false);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generatedQuestions, setGeneratedQuestions] = useState<any[]>([]);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const pollTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const TERMINAL_STATUSES = ['COMPLETED', 'GENERATED_PARTIAL_BATCH', 'FAILED'];

  const pollJobStatus = (generationRequestId: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await aiService.getBatchJobStatus(generationRequestId);
        if (!res.success) return;
        const job = res.job;
        setJobStatus(job.status);
        setJobResult({
          status: job.status,
          message: job.statusMessage,
          requestedCount: job.requestedCount,
          generatedCount: job.generatedCount,
          validatedCount: job.validatedCount,
          verifiedCount: job.verifiedCount,
          pendingReviewCount: job.pendingReviewCount,
          autoPublishedCount: job.autoPublishedCount,
          duplicateCount: job.duplicateCount,
          failedCount: job.failedCount,
          regenerationRounds: job.regenerationRounds,
        });
        setGeneratedQuestions(res.questions || []);

        if (TERMINAL_STATUSES.includes(job.status)) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          setIsGenerating(false);
          if (job.status === 'FAILED') {
            setErrorMsg(job.statusMessage || 'Batch generation failed.');
          }
        }
      } catch (err: any) {
        // Transient poll failure — keep polling, don't abort the job on a single network blip.
        console.error('[AIBatchQuestionGeneratorStudio] Poll error:', err.message);
      }
    }, 3000);
  };

  // Editing Question State
  const [editingQuestion, setEditingQuestion] = useState<any | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      const boundsRes = await aiService.getMinMaxConfigBounds();
      if (boundsRes.success) {
        setMinCount(boundsRes.minCount || 50);
        setMaxCount(boundsRes.maxCount || 500);
      }

      const docsRes = await aiService.getDocuments('READY');
      if (docsRes.data?.success) {
        const docs = docsRes.data.data || [];
        setAvailableDocs(docs);
        setSelectedDocIds(docs.map((d: any) => d.id));
      }

      const subjRes = await api.get('/question-bank/subjects');
      if (subjRes.data?.success) {
        setSubjects(subjRes.data.data || []);
      }

      const settingsRes = await aiService.getGenerationSettings();
      if (settingsRes.success) {
        setAutoPublishVerified(settingsRes.data.autoPublishVerified);
        setMaxRegenerationAttempts(settingsRes.data.maxRegenerationAttempts);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await aiService.updateGenerationSettings({ autoPublishVerified, maxRegenerationAttempts });
      if (res.success) {
        setAutoPublishVerified(res.data.autoPublishVerified);
        setMaxRegenerationAttempts(res.data.maxRegenerationAttempts);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingSettings(false);
    }
  };

  // Distribution calculations
  const diffSum = easyPercent + medPercent + hardPercent;
  const typeSum = mcqPercent + msqPercent + natPercent;

  const easyCount = Math.round((totalQuestions * easyPercent) / 100);
  const medCount = Math.round((totalQuestions * medPercent) / 100);
  const hardCount = totalQuestions - easyCount - medCount;

  const mcqCount = Math.round((totalQuestions * mcqPercent) / 100);
  const msqCount = Math.round((totalQuestions * msqPercent) / 100);
  const natCount = totalQuestions - mcqCount - msqCount;

  const handleToggleDoc = (docId: string) => {
    setSelectedDocIds((prev) => {
      const next = prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId];
      setSelectAllDocs(next.length === availableDocs.length);
      return next;
    });
  };

  const handleToggleAllDocs = () => {
    if (selectAllDocs) {
      setSelectedDocIds([]);
      setSelectAllDocs(false);
    } else {
      setSelectedDocIds(availableDocs.map((d) => d.id));
      setSelectAllDocs(true);
    }
  };

  const handleGenerate = async () => {
    setErrorMsg(null);
    if (totalQuestions < minCount || totalQuestions > maxCount) {
      setErrorMsg(`Total questions must be between ${minCount} and ${maxCount}.`);
      return;
    }
    if (diffSum !== 100) {
      setErrorMsg('Difficulty distribution percentages must sum to exactly 100%.');
      return;
    }
    if (typeSum !== 100) {
      setErrorMsg('Question type distribution percentages must sum to exactly 100%.');
      return;
    }

    setIsGenerating(true);
    setJobStatus('QUEUED');
    setJobResult(null);
    setGeneratedQuestions([]);

    const reqId = `gen_batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    try {
      const res = await aiService.generateBatchQuestions({
        totalQuestions,
        difficultyDistribution: { EASY: easyPercent, MEDIUM: medPercent, HARD: hardPercent },
        typeDistribution: { MCQ: mcqPercent, MSQ: msqPercent, NAT: natPercent },
        negativeMarking,
        solutionVisibility,
        sourceReferences,
        selectedResourceIds: selectedDocIds,
        subjectId: selectedSubjectId || undefined,
        moduleId: selectedModuleId || undefined,
        topicId: selectedTopicId || undefined,
        subtopicId: selectedSubtopicId || undefined,
        generationRequestId: reqId,
      });

      if (!res.success) {
        setErrorMsg(res.message || 'Generation failed.');
        setJobStatus('FAILED');
        setIsGenerating(false);
        return;
      }

      setJobResult(res);
      setJobStatus(res.status);

      // The batch is now QUEUED and processed by the backend's async worker (large batches
      // involve many sequential LLM calls and would otherwise exceed a request timeout) — poll
      // for real progress rather than waiting on a single blocking response.
      if (TERMINAL_STATUSES.includes(res.status)) {
        setGeneratedQuestions(res.questions || []);
        setIsGenerating(false);
      } else {
        pollJobStatus(reqId);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to initiate batch generation.');
      setJobStatus('FAILED');
      setIsGenerating(false);
    }
  };

  const handleApproveQuestion = async (qId: string) => {
    try {
      const res = await aiService.approveQuestion(qId);
      if (res.success) {
        setApprovedIds((prev) => new Set(prev).add(qId));
        setGeneratedQuestions((prev) =>
          prev.map((q) => (q.id === qId ? { ...q, status: 'APPROVED' } : q))
        );
      }
    } catch (e: any) {
      alert(e.message || 'Failed to approve question.');
    }
  };

  const handleRejectQuestion = async (qId: string) => {
    try {
      const res = await aiService.rejectQuestion(qId);
      if (res.success) {
        setGeneratedQuestions((prev) =>
          prev.map((q) => (q.id === qId ? { ...q, status: 'REJECTED' } : q))
        );
      }
    } catch (e: any) {
      alert(e.message || 'Failed to reject question.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Studio Header */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-purple-900 text-white rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-3">
              <Sparkles className="w-8 h-8 text-yellow-400 animate-pulse" />
              <h1 className="text-2xl font-bold">Source-Grounded GATE Question Generator Studio</h1>
            </div>
            <p className="text-blue-200 mt-2 max-w-3xl text-sm">
              Generate 50 to {maxCount} GATE-style questions strictly grounded in Faculty & Admin uploaded textbooks, notes, and academic resources with independent answer verification.
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl text-right">
            <span className="text-xs text-blue-200 block">Allowed Question Range</span>
            <span className="text-lg font-bold text-yellow-300">{minCount} - {maxCount} Questions</span>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center space-x-3 text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium">{errorMsg}</span>
        </div>
      )}

      {/* Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel: Resource Selection & Taxonomy */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-600" />
                Select Uploaded Resources
              </h3>
              <button
                type="button"
                onClick={handleToggleAllDocs}
                className="text-xs text-blue-600 font-medium hover:underline"
              >
                {selectAllDocs ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            {availableDocs.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No READY uploaded resources available.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                {availableDocs.map((doc) => (
                  <label
                    key={doc.id}
                    className={`flex items-center space-x-3 p-2.5 rounded-lg border text-sm cursor-pointer transition ${
                      selectedDocIds.includes(doc.id)
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-200'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDocIds.includes(doc.id)}
                      onChange={() => handleToggleDoc(doc.id)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="truncate flex-1 font-medium">{doc.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Middle Panel: Total Count & Difficulty Distribution */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-6">
          <div>
            <label className="block font-semibold text-slate-800 dark:text-slate-100 text-sm mb-2">
              Total Questions to Generate
            </label>
            <div className="flex items-center space-x-3">
              <input
                type="number"
                min={minCount}
                max={maxCount}
                value={totalQuestions}
                onChange={(e) => setTotalQuestions(Number(e.target.value))}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold text-lg focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs text-slate-500">Min: {minCount} | Max: {maxCount}</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-xs uppercase tracking-wider text-slate-500">Difficulty Distribution</span>
              <span className={`text-xs font-bold ${diffSum === 100 ? 'text-emerald-600' : 'text-red-500'}`}>
                Sum: {diffSum}%
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                  <span>Easy ({easyCount} Qs)</span>
                  <span>{easyPercent}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={easyPercent}
                  onChange={(e) => setEasyPercent(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                  <span>Medium ({medCount} Qs)</span>
                  <span>{medPercent}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={medPercent}
                  onChange={(e) => setMedPercent(Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                  <span>Hard ({hardCount} Qs)</span>
                  <span>{hardPercent}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={hardPercent}
                  onChange={(e) => setHardPercent(Number(e.target.value))}
                  className="w-full accent-purple-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel: Question Types & Execution Button */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-xs uppercase tracking-wider text-slate-500">Question Type Distribution</span>
              <span className={`text-xs font-bold ${typeSum === 100 ? 'text-emerald-600' : 'text-red-500'}`}>
                Sum: {typeSum}%
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                  <span>MCQ ({mcqCount} Qs)</span>
                  <span>{mcqPercent}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={mcqPercent}
                  onChange={(e) => setMcqPercent(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                  <span>MSQ ({msqCount} Qs)</span>
                  <span>{msqPercent}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={msqPercent}
                  onChange={(e) => setMsqPercent(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                  <span>NAT ({natCount} Qs)</span>
                  <span>{natPercent}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={natPercent}
                  onChange={(e) => setNatPercent(Number(e.target.value))}
                  className="w-full accent-teal-500"
                />
              </div>
            </div>
          </div>

          {/* Exam Behavior Toggles */}
          <div className="space-y-2.5 border-t border-slate-100 dark:border-slate-800 pt-4">
            <span className="font-semibold text-xs uppercase tracking-wider text-slate-500 block">Exam Behavior</span>
            <label className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <span>Negative Marking</span>
              <input
                type="checkbox"
                checked={negativeMarking}
                onChange={(e) => setNegativeMarking(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <span>Include Source References</span>
              <input
                type="checkbox"
                checked={sourceReferences}
                onChange={(e) => setSourceReferences(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
            </label>
            <div>
              <label className="block text-xs text-slate-700 dark:text-slate-300 mb-1">Solution Visibility to Students</label>
              <select
                value={solutionVisibility}
                onChange={(e) => setSolutionVisibility(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5"
              >
                <option value="SHOW_AFTER_RESULT">Show After Result</option>
                <option value="SHOW_IMMEDIATELY">Show Immediately After Submission</option>
                <option value="HIDDEN">Hidden (Faculty Only)</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            disabled={isGenerating || diffSum !== 100 || typeSum !== 100}
            onClick={handleGenerate}
            className="w-full py-3.5 px-6 rounded-xl font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 shadow-lg shadow-blue-500/25 flex items-center justify-center space-x-2 transition"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>
                  {jobStatus === 'PROCESSING' && jobResult
                    ? `Processing... ${jobResult.generatedCount}/${jobResult.requestedCount} generated`
                    : 'Queued...'}
                </span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 text-yellow-300" />
                <span>Generate {totalQuestions} Questions</span>
              </>
            )}
          </button>

          {/* Admin-configurable generation governance */}
          {role === 'ADMIN' && (
            <div className="space-y-2.5 border-t border-slate-100 dark:border-slate-800 pt-4">
              <span className="font-semibold text-xs uppercase tracking-wider text-slate-500 block">Admin: Generation Governance</span>
              <label className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <span>Auto-publish verified questions</span>
                <input
                  type="checkbox"
                  checked={autoPublishVerified}
                  onChange={(e) => setAutoPublishVerified(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
              </label>
              <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
                <span>Max regeneration rounds on shortfall</span>
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={maxRegenerationAttempts}
                  onChange={(e) => setMaxRegenerationAttempts(Number(e.target.value))}
                  className="w-14 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1"
                />
              </div>
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50"
              >
                {savingSettings ? 'Saving...' : 'Save Governance Settings'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Batch Execution Results Overview */}
      {jobResult && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b pb-4 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                {TERMINAL_STATUSES.includes(jobResult.status) ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : (
                  <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
                )}
                Batch Generation {TERMINAL_STATUSES.includes(jobResult.status) ? 'Results' : 'In Progress'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{jobResult.message}</p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                jobResult.status === 'COMPLETED'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : jobResult.status === 'FAILED'
                  ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
              }`}
            >
              {jobResult.status}
            </span>
          </div>

          {!TERMINAL_STATUSES.includes(jobResult.status) && (
            <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.round(((jobResult.generatedCount || 0) / (jobResult.requestedCount || 1)) * 100))}%` }}
              />
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl text-center">
              <span className="text-xs text-slate-500 block">Requested</span>
              <span className="text-lg font-bold text-slate-800 dark:text-slate-200">{jobResult.requestedCount}</span>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl text-center">
              <span className="text-xs text-blue-600 dark:text-blue-400 block">Generated</span>
              <span className="text-lg font-bold text-blue-700 dark:text-blue-300">{jobResult.generatedCount}</span>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-xl text-center">
              <span className="text-xs text-emerald-600 dark:text-emerald-400 block">Validated</span>
              <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{jobResult.validatedCount}</span>
            </div>
            <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-xl text-center">
              <span className="text-xs text-indigo-600 dark:text-indigo-400 block">Verified</span>
              <span className="text-lg font-bold text-indigo-700 dark:text-indigo-300">{jobResult.verifiedCount}</span>
            </div>
            <div className="bg-teal-50 dark:bg-teal-900/20 p-3 rounded-xl text-center">
              <span className="text-xs text-teal-600 dark:text-teal-400 block">Auto-Published</span>
              <span className="text-lg font-bold text-teal-700 dark:text-teal-300">{jobResult.autoPublishedCount ?? 0}</span>
            </div>
            <div className="bg-sky-50 dark:bg-sky-900/20 p-3 rounded-xl text-center">
              <span className="text-xs text-sky-600 dark:text-sky-400 block">Awaiting Review</span>
              <span className="text-lg font-bold text-sky-700 dark:text-sky-300">{jobResult.pendingReviewCount ?? 0}</span>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-xl text-center">
              <span className="text-xs text-amber-600 dark:text-amber-400 block">Duplicates</span>
              <span className="text-lg font-bold text-amber-700 dark:text-amber-300">{jobResult.duplicateCount}</span>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-xl text-center">
              <span className="text-xs text-red-600 dark:text-red-400 block">Failed</span>
              <span className="text-lg font-bold text-red-700 dark:text-red-300">{jobResult.failedCount}</span>
            </div>
          </div>
          {jobResult.regenerationRounds > 0 && (
            <p className="text-xs text-slate-500">
              {jobResult.regenerationRounds} automatic regeneration round(s) attempted to make up shortfalls from rejected/duplicate questions.
            </p>
          )}
        </div>
      )}

      {/* Generated Candidate Question Cards List */}
      {generatedQuestions.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            Candidate Questions Pending Review ({generatedQuestions.length})
          </h2>

          <div className="space-y-4">
            {generatedQuestions.map((q, idx) => (
              <div
                key={q.id || idx}
                className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 flex items-center justify-center font-bold text-sm">
                      Q{idx + 1}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold uppercase bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {q.type}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold uppercase bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                      {q.difficulty}
                    </span>
                    {q.verificationStatus === 'PASS' && (
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                      </span>
                    )}
                    {q.verificationStatus === 'ANSWER_CONFLICT' && (
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Answer Conflict
                      </span>
                    )}
                  </div>

                  <span className="text-xs font-medium text-slate-500">
                    Status: <strong className="uppercase">{q.status}</strong>
                  </span>
                </div>

                {/* Question Stem */}
                <p className="text-slate-800 dark:text-slate-200 font-medium text-base leading-relaxed">
                  {q.stem}
                </p>

                {/* Options if MCQ/MSQ */}
                {q.options && Array.isArray(q.options) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    {q.options.map((opt: string, optIdx: number) => {
                      const isCorrect =
                        Array.isArray(q.correctAnswer)
                          ? q.correctAnswer.includes(optIdx)
                          : q.correctAnswer === optIdx;

                      return (
                        <div
                          key={optIdx}
                          className={`p-3 rounded-xl border flex items-center justify-between ${
                            isCorrect
                              ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/20 text-emerald-900 dark:text-emerald-200 font-semibold'
                              : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <span>{String.fromCharCode(65 + optIdx)}. {opt}</span>
                          {isCorrect && <Check className="w-4 h-4 text-emerald-600" />}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Explanation & Source References */}
                <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl space-y-2 text-xs">
                  <div>
                    <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Step-by-step Explanation:</span>
                    <p className="text-slate-600 dark:text-slate-400">{q.explanation}</p>
                  </div>
                  {q.sourceDocumentIds && q.sourceDocumentIds.length > 0 && (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2 text-blue-600 dark:text-blue-400">
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Sources: Document IDs [{q.sourceDocumentIds.join(', ')}]</span>
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                {q.status === 'APPROVED' ? (
                  <div className="flex items-center justify-end pt-2">
                    <span className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      {approvedIds.has(q.id) ? 'Approved' : 'Auto-published (verified)'}
                    </span>
                  </div>
                ) : q.status === 'REJECTED' ? (
                  <div className="flex items-center justify-end pt-2">
                    <span className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                      Rejected
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-end space-x-3 pt-2">
                    <button
                      type="button"
                      onClick={() => handleRejectQuestion(q.id)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition border border-red-200 dark:border-red-800"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApproveQuestion(q.id)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition shadow-sm flex items-center space-x-1"
                    >
                      <Check className="w-4 h-4" />
                      <span>Approve</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
