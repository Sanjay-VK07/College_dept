'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { aiService } from '@/services/aiService';
import {
  BookOpen,
  CheckCircle2,
  AlertCircle,
  FileText,
  RefreshCw,
  Check,
  X,
  UploadCloud,
  AlertTriangle,
  Loader2,
  Clock,
  Eye,
  Trash2,
} from 'lucide-react';
import api from '@/lib/api';

interface AIBatchQuestionGeneratorStudioProps {
  role?: string;
}

type StepId = 'resources' | 'configure' | 'generate' | 'verify' | 'review';

const STEPS: Array<{ id: StepId; index: string; label: string }> = [
  { id: 'resources', index: '01', label: 'Resources' },
  { id: 'configure', index: '02', label: 'Configure' },
  { id: 'generate', index: '03', label: 'Generate' },
  { id: 'verify', index: '04', label: 'Verify' },
  { id: 'review', index: '05', label: 'Review' },
];

const TERMINAL_STATUSES = ['COMPLETED', 'GENERATED_PARTIAL_BATCH', 'FAILED'];

/**
 * Distributes `total` across percentage buckets so the parts always sum exactly to `total`.
 * Uses the largest-remainder (Hamilton) method — the same apportionment the backend applies —
 * so the counts shown here match what the server will actually plan.
 */
function apportion(total: number, parts: Record<string, number>): Record<string, number> {
  const keys = Object.keys(parts);
  const exact: Record<string, number> = {};
  const floored: Record<string, number> = {};
  let assigned = 0;

  for (const k of keys) {
    exact[k] = (total * (parts[k] || 0)) / 100;
    floored[k] = Math.floor(exact[k]);
    assigned += floored[k];
  }

  const remainders = keys
    .map((k) => ({ k, r: exact[k] - floored[k] }))
    .sort((a, b) => b.r - a.r);

  let leftover = total - assigned;
  let i = 0;
  while (leftover > 0 && i < remainders.length) {
    floored[remainders[i].k] += 1;
    leftover--;
    i++;
  }
  return floored;
}

/** Maps a raw backend document-processing status to a readable institutional label. */
const PROCESSING_STAGE_LABEL: Record<string, string> = {
  QUEUED: 'Queued',
  EXTRACTING: 'Extracting text',
  OCR: 'OCR processing',
  STRUCTURING: 'Analyzing document structure',
  INDEXING: 'Indexing content',
  CLASSIFYING: 'Classifying content',
  MAPPING: 'Mapping answer keys',
  COMPLETED: 'Ready',
  COMPLETED_WITH_ERRORS: 'Ready (partial)',
  FAILED: 'Processing failed',
};

export const AIBatchQuestionGeneratorStudio: React.FC<AIBatchQuestionGeneratorStudioProps> = ({ role = 'FACULTY' }) => {
  const [activeStep, setActiveStep] = useState<StepId>('resources');

  // Bounds & governance (admin-configured, fetched from backend — never hardcoded)
  const [minCount, setMinCount] = useState(50);
  const [maxCount, setMaxCount] = useState(500);
  const [autoPublishVerified, setAutoPublishVerified] = useState(true);
  const [maxRegenerationAttempts, setMaxRegenerationAttempts] = useState(2);
  const [savingSettings, setSavingSettings] = useState(false);

  // Step 1 — Resources
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 — Configuration
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

  // Taxonomy (real Subject → Module → Topic → Subtopic tree)
  const [taxonomy, setTaxonomy] = useState<any[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [selectedSubtopicId, setSelectedSubtopicId] = useState('');

  // Step 3/4 — Generation job
  const [isGenerating, setIsGenerating] = useState(false);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generatedQuestions, setGeneratedQuestions] = useState<any[]>([]);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Step 5 — Review
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [detailQuestion, setDetailQuestion] = useState<any | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState<null | 'approve' | 'reject'>(null);
  const [isBulkActing, setIsBulkActing] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const [toast, setToast] = useState<string>('');
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 5000);
  };

  // ---------------------------------------------------------------- data loading

  const loadDocuments = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const res = await aiService.getDocuments(undefined, 100);
      if (res?.success) setDocuments(res.data || []);
    } catch (e: any) {
      setErrorMsg(e.response?.data?.message || 'Failed to load uploaded resources.');
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const boundsRes = await aiService.getMinMaxConfigBounds();
        if (boundsRes?.success) {
          setMinCount(boundsRes.minCount || 50);
          setMaxCount(boundsRes.maxCount || 500);
          setTotalQuestions((prev) => Math.max(prev, boundsRes.minCount || 50));
        }
      } catch { /* bounds fall back to the defaults above */ }

      try {
        const taxRes = await aiService.getTaxonomy();
        if (taxRes?.success) setTaxonomy(taxRes.data || []);
      } catch { /* taxonomy is optional scoping — generation still works without it */ }

      try {
        const settingsRes = await aiService.getGenerationSettings();
        if (settingsRes?.success) {
          setAutoPublishVerified(settingsRes.data.autoPublishVerified);
          setMaxRegenerationAttempts(settingsRes.data.maxRegenerationAttempts);
        }
      } catch { /* governance settings are admin-only; non-admins simply don't see the panel */ }

      loadDocuments();
    })();
  }, [loadDocuments]);

  // While any document is still processing, refresh the list so the pipeline stages advance
  // from real backend job state (never a simulated timer).
  useEffect(() => {
    const anyProcessing = documents.some(
      (d) => d.processingJob && !['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED'].includes(d.processingJob.status)
    );
    if (!anyProcessing) return;
    const t = setInterval(loadDocuments, 5000);
    return () => clearInterval(t);
  }, [documents, loadDocuments]);

  useEffect(() => () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); }, []);

  // ---------------------------------------------------------------- derived values

  const diffSum = easyPercent + medPercent + hardPercent;
  const typeSum = mcqPercent + msqPercent + natPercent;
  const countInRange = totalQuestions >= minCount && totalQuestions <= maxCount;

  const diffCounts = apportion(totalQuestions, { EASY: easyPercent, MEDIUM: medPercent, HARD: hardPercent });
  const typeCounts = apportion(totalQuestions, { MCQ: mcqPercent, MSQ: msqPercent, NAT: natPercent });

  const readyDocs = documents.filter(
    (d) => d.status === 'READY' || d.processingJob?.status === 'COMPLETED' || d.processingJob?.status === 'COMPLETED_WITH_ERRORS'
  );
  const selectedDocs = documents.filter((d) => selectedDocIds.includes(d.id));

  const canGenerate = selectedDocIds.length > 0 && countInRange && diffSum === 100 && typeSum === 100;

  const subjects = taxonomy;
  const topics = subjects.find((s: any) => s.id === selectedSubjectId)?.modules?.flatMap((m: any) => m.topics || []) || [];
  const subtopics = topics.find((t: any) => t.id === selectedTopicId)?.subtopics || [];

  // ---------------------------------------------------------------- actions

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrorMsg(null);
    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const res = await aiService.uploadDocument(file, file.name, 'FACULTY');
        const newDocId = res?.data?.id;
        if (newDocId) {
          // Kick off real structure extraction so page/question detection progress is genuine.
          try {
            await aiService.processDocumentStructure(newDocId);
          } catch (e: any) {
            showToast(`Uploaded "${file.name}", but structure extraction could not be queued: ${e.response?.data?.message || e.message}`);
          }
        }
      }
      showToast('Upload complete. Structure extraction is running in the background.');
      loadDocuments();
    } catch (e: any) {
      setErrorMsg(e.response?.data?.message || 'Upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveDocument = async (docId: string) => {
    try {
      await aiService.deleteDocument(docId);
      setSelectedDocIds((prev) => prev.filter((id) => id !== docId));
      showToast('Resource removed.');
      loadDocuments();
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Failed to remove resource.');
    }
  };

  const handleViewDocument = async (docId: string, fileName: string) => {
    try {
      const res = await api.get(`/ai/documents/${docId}/download`, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(blobUrl, '_blank');
    } catch (e: any) {
      showToast(e.response?.data?.message || `Failed to open ${fileName}`);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await aiService.updateGenerationSettings({ autoPublishVerified, maxRegenerationAttempts });
      if (res?.success) {
        setAutoPublishVerified(res.data.autoPublishVerified);
        setMaxRegenerationAttempts(res.data.maxRegenerationAttempts);
        showToast('Generation governance settings saved.');
      }
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Failed to save settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const pollJob = (generationRequestId: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await aiService.getBatchJobStatus(generationRequestId);
        if (!res?.success) return;
        const job = res.job;
        setJobStatus(job.status);
        setJobResult(job);
        setGeneratedQuestions(res.questions || []);

        if (TERMINAL_STATUSES.includes(job.status)) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          setIsGenerating(false);
          if (job.status === 'FAILED') {
            setErrorMsg(job.statusMessage || 'Generation failed.');
          } else {
            setActiveStep('verify');
          }
        }
      } catch (err: any) {
        // A single failed poll is transient — keep polling rather than aborting a running job.
        console.error('[QuestionGenerator] Poll error:', err.message);
      }
    }, 3000);
  };

  const handleGenerate = async () => {
    setErrorMsg(null);
    if (!canGenerate) return;

    setIsGenerating(true);
    setJobStatus('QUEUED');
    setJobResult(null);
    setGeneratedQuestions([]);
    setActiveStep('generate');

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
        topicId: selectedTopicId || undefined,
        subtopicId: selectedSubtopicId || undefined,
        generationRequestId: reqId,
      });

      if (!res?.success) {
        setErrorMsg(res?.message || 'Generation request was rejected.');
        setJobStatus('FAILED');
        setIsGenerating(false);
        return;
      }

      setJobResult(res);
      setJobStatus(res.status);
      if (TERMINAL_STATUSES.includes(res.status)) {
        setGeneratedQuestions(res.questions || []);
        setIsGenerating(false);
      } else {
        pollJob(reqId);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to start generation.');
      setJobStatus('FAILED');
      setIsGenerating(false);
    }
  };

  const handleApprove = async (qId: string) => {
    setActioningId(qId);
    try {
      const res = await aiService.approveQuestion(qId);
      if (res?.success) {
        setGeneratedQuestions((prev) => prev.map((q) => (q.id === qId ? { ...q, status: 'APPROVED' } : q)));
        setDetailQuestion((prev: any) => (prev?.id === qId ? { ...prev, status: 'APPROVED' } : prev));
        showToast('Question approved and published to the Question Bank.');
      }
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Failed to approve question.');
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (qId: string) => {
    setActioningId(qId);
    try {
      const res = await aiService.rejectQuestion(qId);
      if (res?.success) {
        setGeneratedQuestions((prev) => prev.map((q) => (q.id === qId ? { ...q, status: 'REJECTED' } : q)));
        setDetailQuestion((prev: any) => (prev?.id === qId ? { ...prev, status: 'REJECTED' } : prev));
        showToast('Question rejected.');
      }
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Failed to reject question.');
    } finally {
      setActioningId(null);
    }
  };

  const handleBulkAction = async () => {
    const ids = Array.from(selectedQuestionIds);
    if (ids.length === 0 || !bulkConfirm) return;

    setIsBulkActing(true);
    const succeeded: string[] = [];
    const failed: string[] = [];

    // No bulk approve/reject endpoint exists for AI-generated candidates yet, so these run as
    // real sequential API calls. Every outcome is counted honestly — a partial failure is
    // reported as a partial failure, never rolled up into a blanket success message.
    for (const id of ids) {
      try {
        const res = bulkConfirm === 'approve' ? await aiService.approveQuestion(id) : await aiService.rejectQuestion(id);
        if (res?.success) succeeded.push(id);
        else failed.push(id);
      } catch {
        failed.push(id);
      }
    }

    const newStatus = bulkConfirm === 'approve' ? 'APPROVED' : 'REJECTED';
    setGeneratedQuestions((prev) => prev.map((q) => (succeeded.includes(q.id) ? { ...q, status: newStatus } : q)));
    setSelectedQuestionIds(new Set(failed));
    setIsBulkActing(false);
    setBulkConfirm(null);

    showToast(
      failed.length === 0
        ? `${succeeded.length} question(s) ${bulkConfirm === 'approve' ? 'approved' : 'rejected'}.`
        : `${succeeded.length} succeeded, ${failed.length} failed. Failed items remain selected.`
    );
  };

  const toggleQuestionSelection = (id: string) => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reviewableQuestions = generatedQuestions;
  const allReviewSelected = reviewableQuestions.length > 0 && reviewableQuestions.every((q) => selectedQuestionIds.has(q.id));

  const toggleSelectAllReview = () => {
    if (allReviewSelected) setSelectedQuestionIds(new Set());
    else setSelectedQuestionIds(new Set(reviewableQuestions.map((q) => q.id)));
  };

  // Faculty workload: surface anything needing a human first, verified items last.
  const REVIEW_PRIORITY: Record<string, number> = {
    ANSWER_CONFLICT: 0,
    REQUIRES_REVIEW: 1,
    FAIL: 2,
    UNVERIFIED: 3,
    PASS: 4,
  };
  const sortedReviewQuestions = [...reviewableQuestions].sort(
    (a, b) => (REVIEW_PRIORITY[a.verificationStatus] ?? 3) - (REVIEW_PRIORITY[b.verificationStatus] ?? 3)
  );

  // ---------------------------------------------------------------- shared UI bits

  const VerificationBadge = ({ status }: { status?: string }) => {
    if (status === 'PASS')
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" /> Verified
        </span>
      );
    if (status === 'ANSWER_CONFLICT')
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200">
          <AlertTriangle className="w-3 h-3" /> Source conflict
        </span>
      );
    if (status === 'FAIL')
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200">
          <X className="w-3 h-3" /> Failed verification
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        <Clock className="w-3 h-3" /> Needs review
      </span>
    );
  };

  const PercentField = ({ label, value, onChange, count }: { label: string; value: number; onChange: (v: number) => void; count: number }) => (
    <div className="flex items-center justify-between gap-3 py-2">
      <label className="text-xs font-medium text-slate-700 w-20 shrink-0">{label}</label>
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="number"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(Math.max(0, Math.min(100, Number(e.target.value))))}
          className="w-20 px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-900 text-xs font-mono text-right focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
        />
        <span className="text-xs text-slate-500 w-4">%</span>
        <span className="text-xs font-mono text-slate-600 w-24 text-right">{count} question{count === 1 ? '' : 's'}</span>
      </div>
    </div>
  );

  // ---------------------------------------------------------------- render

  return (
    <div className="bg-slate-50 min-h-full">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded shadow-lg max-w-md">
          {toast}
        </div>
      )}

      {/* Institutional header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-base font-bold text-slate-900 uppercase tracking-wide">AI Question Generator</h1>
            <p className="text-xs text-slate-600 mt-1 max-w-3xl">
              Generate source-grounded GATE questions from Faculty/Admin uploaded academic resources.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded bg-blue-50 text-blue-800 border border-blue-200">Source-grounded</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200">AI-assisted</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">Automatic verification</span>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex flex-wrap items-center gap-1 mt-4 overflow-x-auto">
          {STEPS.map((s, idx) => {
            const isActive = activeStep === s.id;
            const isPast = STEPS.findIndex((x) => x.id === activeStep) > idx;
            return (
              <React.Fragment key={s.id}>
                <button
                  type="button"
                  onClick={() => setActiveStep(s.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium border transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-[#1E40AF] text-white border-[#1E40AF]'
                      : isPast
                      ? 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                      : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span className="font-mono font-bold">{s.index}</span>
                  <span>{s.label}</span>
                </button>
                {idx < STEPS.length - 1 && <span className="text-slate-300 text-xs px-0.5">→</span>}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="p-6 space-y-5">
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded p-3 flex items-start gap-2.5 text-red-800">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="text-xs">{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="ml-auto text-red-400 hover:text-red-700"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* ============================ STEP 1 — RESOURCES ============================ */}
        {activeStep === 'resources' && (
          <div className="space-y-5">
            <section className="bg-white border border-slate-200 rounded">
              <header className="px-5 py-3 border-b border-slate-200">
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Source Resources</h2>
              </header>
              <div className="p-5">
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleUploadFiles(e.dataTransfer.files); }}
                  className={`border-2 border-dashed rounded p-8 text-center transition-colors ${
                    isDragging ? 'border-blue-500 bg-blue-50/50' : 'border-slate-300 bg-slate-50/50'
                  }`}
                >
                  <UploadCloud className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-800">Upload academic resources</p>
                  <p className="text-xs text-slate-500 mt-1">Drag &amp; drop PDF / e-book / study material</p>
                  <p className="text-[11px] text-slate-400 mt-2">Supported: PDF • Scanned PDF • E-book • Text-based academic resources</p>
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded bg-[#1E40AF] text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-50"
                  >
                    {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                    {isUploading ? 'Uploading...' : 'Browse Files'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt"
                    multiple
                    className="hidden"
                    onChange={(e) => { handleUploadFiles(e.target.files); e.target.value = ''; }}
                  />
                </div>
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded">
              <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Uploaded Resources ({documents.length})
                </h2>
                <button onClick={loadDocuments} disabled={loadingDocs} className="text-xs text-blue-700 hover:underline flex items-center gap-1 disabled:opacity-50">
                  <RefreshCw className={`w-3 h-3 ${loadingDocs ? 'animate-spin' : ''}`} /> Refresh
                </button>
              </header>

              {documents.length === 0 ? (
                <div className="px-5 py-6 text-center">
                  <p className="text-xs font-semibold text-slate-700">No resources uploaded yet.</p>
                  <p className="text-xs text-slate-500 mt-1">Upload a GATE-related resource to begin question generation.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr className="text-left text-slate-600">
                        <th className="px-3 py-2 font-semibold w-8"></th>
                        <th className="px-3 py-2 font-semibold">Resource Name</th>
                        <th className="px-3 py-2 font-semibold">Type</th>
                        <th className="px-3 py-2 font-semibold">Pages</th>
                        <th className="px-3 py-2 font-semibold">Processing Status</th>
                        <th className="px-3 py-2 font-semibold">Detected</th>
                        <th className="px-3 py-2 font-semibold">Uploaded By</th>
                        <th className="px-3 py-2 font-semibold">Uploaded</th>
                        <th className="px-3 py-2 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {documents.map((doc) => {
                        const job = doc.processingJob;
                        const isReady = job?.status === 'COMPLETED' || job?.status === 'COMPLETED_WITH_ERRORS' || doc.status === 'READY';
                        const isFailed = job?.status === 'FAILED' || doc.status === 'FAILED';
                        const inProgress = job && !['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED'].includes(job.status);
                        return (
                          <tr key={doc.id} className={selectedDocIds.includes(doc.id) ? 'bg-blue-50/40' : ''}>
                            <td className="px-3 py-2.5">
                              <input
                                type="checkbox"
                                className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                                checked={selectedDocIds.includes(doc.id)}
                                disabled={!isReady}
                                title={isReady ? 'Use this resource for generation' : 'Resource is not ready yet'}
                                onChange={() =>
                                  setSelectedDocIds((prev) =>
                                    prev.includes(doc.id) ? prev.filter((id) => id !== doc.id) : [...prev, doc.id]
                                  )
                                }
                              />
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-slate-900 max-w-xs truncate" title={doc.title}>{doc.title}</td>
                            <td className="px-3 py-2.5 text-slate-600">{doc.mimeType?.includes('pdf') ? 'PDF' : doc.mimeType || '—'}</td>
                            <td className="px-3 py-2.5 font-mono text-slate-700">
                              {job?.totalPages
                                ? inProgress
                                  ? `${job.pagesProcessed}/${job.totalPages}`
                                  : `${job.totalPages}`
                                : '—'}
                            </td>
                            <td className="px-3 py-2.5">
                              {isFailed ? (
                                <span className="inline-flex items-center gap-1 text-red-700 font-semibold">
                                  <X className="w-3 h-3" /> {PROCESSING_STAGE_LABEL[job?.status] || 'Failed'}
                                </span>
                              ) : isReady ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                  <CheckCircle2 className="w-3 h-3" /> {job ? PROCESSING_STAGE_LABEL[job.status] : 'Ready'}
                                </span>
                              ) : job ? (
                                <span className="inline-flex items-center gap-1 text-blue-700 font-semibold">
                                  <Loader2 className="w-3 h-3 animate-spin" /> {PROCESSING_STAGE_LABEL[job.status] || job.status}
                                </span>
                              ) : (
                                <span className="text-slate-500">{doc.status}</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-slate-700">
                              {job ? `${job.questionsFound}Q / ${job.mappingsResolved} mapped` : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-slate-600">{doc.uploadedBy?.name || '—'}</td>
                            <td className="px-3 py-2.5 font-mono text-slate-500">{new Date(doc.createdAt).toLocaleDateString()}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1">
                                <button onClick={() => handleViewDocument(doc.id, doc.title)} className="p-1.5 text-blue-700 hover:bg-blue-50 rounded" title="View resource">
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => handleRemoveDocument(doc.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Remove resource">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Per-resource real pipeline detail for anything currently processing or failed */}
            {documents.filter((d) => d.processingJob).map((doc) => {
              const job = doc.processingJob;
              const inProgress = !['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED'].includes(job.status);
              if (!inProgress && job.status !== 'FAILED' && job.status !== 'COMPLETED_WITH_ERRORS') return null;
              return (
                <section key={doc.id} className={`bg-white border rounded p-4 ${job.status === 'FAILED' ? 'border-red-200' : 'border-slate-200'}`}>
                  <h3 className="text-xs font-bold text-slate-900 mb-2">{doc.title}</h3>
                  {job.status === 'FAILED' ? (
                    <p className="text-xs text-red-700 flex items-start gap-1.5">
                      <X className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>Processing failed: {job.error || job.statusMessage || 'Unknown error.'}</span>
                    </p>
                  ) : (
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center gap-2 text-slate-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Uploaded
                      </div>
                      <div className="flex items-center gap-2 text-slate-700">
                        {job.totalPages ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />}
                        {job.totalPages ? `${job.pagesProcessed} of ${job.totalPages} pages extracted` : 'Extracting pages'}
                      </div>
                      <div className="flex items-center gap-2 text-slate-700">
                        {job.questionsFound > 0 ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Clock className="w-3.5 h-3.5 text-slate-400" />}
                        {job.questionsFound} questions detected
                      </div>
                      <div className="flex items-center gap-2 text-slate-700">
                        {job.mappingsResolved > 0 ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Clock className="w-3.5 h-3.5 text-slate-400" />}
                        {job.mappingsResolved} answer keys mapped
                        {job.mappingsUncertain > 0 && <span className="text-amber-700">({job.mappingsUncertain} uncertain)</span>}
                      </div>
                      {job.totalPages > 0 && (
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
                          <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: `${Math.min(100, Math.round((job.pagesProcessed / job.totalPages) * 100))}%` }} />
                        </div>
                      )}
                      {job.statusMessage && <p className="text-[11px] text-slate-500 pt-1">{job.statusMessage}</p>}
                    </div>
                  )}
                </section>
              );
            })}

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-600">
                {selectedDocIds.length === 0
                  ? readyDocs.length === 0
                    ? 'No resources are ready for generation yet.'
                    : 'Select one or more ready resources to continue.'
                  : `${selectedDocIds.length} resource(s) selected.`}
              </p>
              <button
                type="button"
                disabled={selectedDocIds.length === 0}
                onClick={() => setActiveStep('configure')}
                className="px-5 py-2 rounded bg-[#1E40AF] text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue to Configuration →
              </button>
            </div>
          </div>
        )}

        {/* ============================ STEP 2 — CONFIGURE ============================ */}
        {activeStep === 'configure' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            {/* LEFT: configuration */}
            <div className="xl:col-span-2 space-y-5">
              <section className="bg-white border border-slate-200 rounded">
                <header className="px-5 py-3 border-b border-slate-200">
                  <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Question Paper Configuration</h2>
                </header>
                <div className="p-5 space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Total Questions</label>
                    <input
                      type="number"
                      min={minCount}
                      max={maxCount}
                      value={totalQuestions}
                      onChange={(e) => setTotalQuestions(Number(e.target.value))}
                      className={`w-full max-w-xs px-3 py-2.5 rounded border bg-white text-slate-900 text-lg font-mono font-semibold focus:outline-none focus:ring-1 ${
                        countInRange ? 'border-slate-300 focus:ring-blue-500 focus:border-blue-500' : 'border-red-400 focus:ring-red-500'
                      }`}
                    />
                    <p className={`text-xs mt-1.5 ${countInRange ? 'text-slate-500' : 'text-red-700 font-semibold'}`}>
                      Minimum: {minCount} &nbsp;•&nbsp; Maximum: {maxCount}
                      {!countInRange && ' — value is outside the permitted range.'}
                    </p>
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Target</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Subject</label>
                        <select
                          value={selectedSubjectId}
                          onChange={(e) => { setSelectedSubjectId(e.target.value); setSelectedTopicId(''); setSelectedSubtopicId(''); }}
                          className="w-full px-2.5 py-2 rounded border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="">All Subjects</option>
                          {subjects.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Topic</label>
                        <select
                          value={selectedTopicId}
                          onChange={(e) => { setSelectedTopicId(e.target.value); setSelectedSubtopicId(''); }}
                          disabled={!selectedSubjectId}
                          className="w-full px-2.5 py-2 rounded border border-slate-300 bg-white text-xs text-slate-900 disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="">All Topics</option>
                          {topics.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Subtopic</label>
                        <select
                          value={selectedSubtopicId}
                          onChange={(e) => setSelectedSubtopicId(e.target.value)}
                          disabled={!selectedTopicId}
                          className="w-full px-2.5 py-2 rounded border border-slate-300 bg-white text-xs text-slate-900 disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="">All Subtopics</option>
                          {subtopics.map((st: any) => <option key={st.id} value={st.id}>{st.name}</option>)}
                        </select>
                      </div>
                    </div>
                    {subjects.length === 0 && (
                      <p className="text-[11px] text-slate-500 mt-2">No taxonomy is configured yet — generation will use the full available source content.</p>
                    )}
                  </div>
                </div>
              </section>

              <section className="bg-white border border-slate-200 rounded">
                <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Difficulty Distribution</h2>
                  <span className={`text-xs font-semibold ${diffSum === 100 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {diffSum === 100 ? '✓ Totals 100%' : `⚠ Must total 100% (currently ${diffSum}%)`}
                  </span>
                </header>
                <div className="p-5 divide-y divide-slate-100">
                  <PercentField label="Easy" value={easyPercent} onChange={setEasyPercent} count={diffCounts.EASY} />
                  <PercentField label="Medium" value={medPercent} onChange={setMedPercent} count={diffCounts.MEDIUM} />
                  <PercentField label="Hard" value={hardPercent} onChange={setHardPercent} count={diffCounts.HARD} />
                </div>
              </section>

              <section className="bg-white border border-slate-200 rounded">
                <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Question Type Distribution</h2>
                  <span className={`text-xs font-semibold ${typeSum === 100 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {typeSum === 100 ? '✓ Totals 100%' : `⚠ Must total 100% (currently ${typeSum}%)`}
                  </span>
                </header>
                <div className="p-5 divide-y divide-slate-100">
                  <PercentField label="MCQ" value={mcqPercent} onChange={setMcqPercent} count={typeCounts.MCQ} />
                  <PercentField label="MSQ" value={msqPercent} onChange={setMsqPercent} count={typeCounts.MSQ} />
                  <PercentField label="NAT" value={natPercent} onChange={setNatPercent} count={typeCounts.NAT} />
                </div>
              </section>

              <section className="bg-white border border-slate-200 rounded">
                <header className="px-5 py-3 border-b border-slate-200">
                  <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Exam Settings</h2>
                </header>
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Negative Marking</p>
                      <p className="text-[11px] text-slate-500">Applies GATE-standard negative marks to MCQ items.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNegativeMarking(!negativeMarking)}
                      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${negativeMarking ? 'bg-[#1E40AF]' : 'bg-slate-300'}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${negativeMarking ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Source References</p>
                      <p className="text-[11px] text-slate-500">Attach the originating document and page to each question.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSourceReferences(!sourceReferences)}
                      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${sourceReferences ? 'bg-[#1E40AF]' : 'bg-slate-300'}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${sourceReferences ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <div className="border-t border-slate-100 pt-3">
                    <label className="block text-xs font-semibold text-slate-800 mb-1.5">Solution Visibility</label>
                    <select
                      value={solutionVisibility}
                      onChange={(e) => setSolutionVisibility(e.target.value)}
                      className="w-full max-w-sm px-2.5 py-2 rounded border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="SHOW_AFTER_RESULT">Visible after result publication</option>
                      <option value="SHOW_IMMEDIATELY">Visible immediately after submission</option>
                      <option value="HIDDEN">Hidden from students (Faculty only)</option>
                    </select>
                  </div>
                </div>
              </section>

              {role === 'ADMIN' && (
                <section className="bg-white border border-slate-200 rounded">
                  <header className="px-5 py-3 border-b border-slate-200">
                    <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Administrator — Generation Governance</h2>
                  </header>
                  <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Auto-publish verified questions</p>
                        <p className="text-[11px] text-slate-500">Questions passing independent verification enter the Question Bank without manual approval.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAutoPublishVerified(!autoPublishVerified)}
                        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${autoPublishVerified ? 'bg-[#1E40AF]' : 'bg-slate-300'}`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${autoPublishVerified ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3">
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Max regeneration rounds</p>
                        <p className="text-[11px] text-slate-500">Extra attempts to make up a shortfall before reporting it honestly.</p>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={5}
                        value={maxRegenerationAttempts}
                        onChange={(e) => setMaxRegenerationAttempts(Number(e.target.value))}
                        className="w-16 px-2 py-1.5 rounded border border-slate-300 text-xs font-mono text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveSettings}
                      disabled={savingSettings}
                      className="text-xs font-semibold text-blue-700 hover:underline disabled:opacity-50"
                    >
                      {savingSettings ? 'Saving...' : 'Save Governance Settings'}
                    </button>
                  </div>
                </section>
              )}
            </div>

            {/* RIGHT: summary rail */}
            <div className="space-y-5">
              <section className="bg-white border border-slate-200 rounded">
                <header className="px-5 py-3 border-b border-slate-200">
                  <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Source Grounding</h2>
                </header>
                <div className="p-5 space-y-2">
                  <p className="text-xs text-slate-600">
                    Questions are generated only from the selected uploaded resources and indexed source content.
                  </p>
                  <ul className="space-y-1.5 pt-1">
                    {[
                      sourceReferences ? 'Source references attached' : 'Source references disabled',
                      'Answer verification enabled',
                      'Duplicate detection enabled',
                    ].map((line, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-slate-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> {line}
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="bg-white border border-slate-200 rounded">
                <header className="px-5 py-3 border-b border-slate-200">
                  <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Generation Summary</h2>
                </header>
                <dl className="p-5 space-y-3 text-xs">
                  <div>
                    <dt className="text-slate-500 mb-1">Source</dt>
                    <dd className="text-slate-900 font-semibold">
                      {selectedDocs.length === 0 ? <span className="text-red-700">No resource selected</span> : selectedDocs.map((d) => d.title).join(', ')}
                    </dd>
                  </div>
                  <div className="border-t border-slate-100 pt-2.5">
                    <dt className="text-slate-500 mb-1">Scope</dt>
                    <dd className="text-slate-900 font-semibold">
                      {[
                        subjects.find((s: any) => s.id === selectedSubjectId)?.name,
                        topics.find((t: any) => t.id === selectedTopicId)?.name,
                        subtopics.find((st: any) => st.id === selectedSubtopicId)?.name,
                      ].filter(Boolean).join(' → ') || 'All available source content'}
                    </dd>
                  </div>
                  <div className="border-t border-slate-100 pt-2.5">
                    <dt className="text-slate-500 mb-1">Questions</dt>
                    <dd className="text-slate-900 font-bold text-base font-mono">{totalQuestions}</dd>
                  </div>
                  <div className="border-t border-slate-100 pt-2.5">
                    <dt className="text-slate-500 mb-1">Difficulty</dt>
                    <dd className="text-slate-900 font-mono">
                      {easyPercent}% Easy · {medPercent}% Medium · {hardPercent}% Hard
                    </dd>
                  </div>
                  <div className="border-t border-slate-100 pt-2.5">
                    <dt className="text-slate-500 mb-1">Types</dt>
                    <dd className="text-slate-900 font-mono">
                      {mcqPercent}% MCQ · {msqPercent}% MSQ · {natPercent}% NAT
                    </dd>
                  </div>
                  <div className="border-t border-slate-100 pt-2.5">
                    <dt className="text-slate-500 mb-1">Verification</dt>
                    <dd className="text-slate-900 font-semibold">Automatic</dd>
                  </div>
                </dl>
                <div className="px-5 pb-5">
                  <button
                    type="button"
                    disabled={!canGenerate || isGenerating}
                    onClick={handleGenerate}
                    className="w-full py-3 rounded bg-[#1E40AF] text-white text-xs font-bold hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Generate {totalQuestions} Verified Questions
                  </button>
                  {!canGenerate && (
                    <p className="text-[11px] text-red-700 mt-2">
                      {selectedDocIds.length === 0
                        ? 'Select at least one source resource in Step 1.'
                        : !countInRange
                        ? `Question count must be between ${minCount} and ${maxCount}.`
                        : 'Both distributions must total exactly 100%.'}
                    </p>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ============================ STEP 3 — GENERATE ============================ */}
        {activeStep === 'generate' && (
          <section className="bg-white border border-slate-200 rounded">
            <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Generation Progress</h2>
              {jobStatus && (
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border ${
                  jobStatus === 'COMPLETED' ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : jobStatus === 'FAILED' ? 'bg-red-50 text-red-800 border-red-200'
                  : 'bg-blue-50 text-blue-800 border-blue-200'
                }`}>{jobStatus}</span>
              )}
            </header>

            {!jobResult && !isGenerating ? (
              <div className="px-5 py-8 text-center">
                <p className="text-xs text-slate-600">No generation job has been started.</p>
                <button onClick={() => setActiveStep('configure')} className="mt-2 text-xs text-blue-700 hover:underline">← Back to configuration</button>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <div className="space-y-2">
                  {[
                    { label: 'Document retrieval', done: !!jobResult },
                    { label: 'Question generation', done: (jobResult?.generatedCount ?? 0) > 0, active: isGenerating },
                    { label: 'Independent verification', done: (jobResult?.verifiedCount ?? 0) > 0, active: isGenerating && (jobResult?.generatedCount ?? 0) > 0 },
                    { label: 'Duplicate detection', done: (jobResult?.duplicateCount ?? 0) >= 0 && !isGenerating },
                    { label: 'Question Bank insertion', done: (jobResult?.autoPublishedCount ?? 0) > 0 },
                  ].map((stage, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {stage.done ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : stage.active ? (
                        <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                      ) : (
                        <Clock className="w-4 h-4 text-slate-300 shrink-0" />
                      )}
                      <span className={stage.done ? 'text-slate-900 font-medium' : stage.active ? 'text-blue-800 font-medium' : 'text-slate-400'}>
                        {stage.label}
                      </span>
                    </div>
                  ))}
                </div>

                {jobResult && (
                  <>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.round(((jobResult.generatedCount || 0) / (jobResult.requestedCount || 1)) * 100))}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      {[
                        { label: 'Requested', value: jobResult.requestedCount, tone: 'text-slate-900' },
                        { label: 'Generated', value: jobResult.generatedCount, tone: 'text-blue-800' },
                        { label: 'Verified', value: jobResult.verifiedCount, tone: 'text-emerald-800' },
                        { label: 'Auto-published', value: jobResult.autoPublishedCount ?? 0, tone: 'text-teal-800' },
                        { label: 'Duplicates', value: jobResult.duplicateCount, tone: 'text-amber-800' },
                        { label: 'Failed', value: jobResult.failedCount, tone: 'text-red-800' },
                      ].map((s) => (
                        <div key={s.label} className="border border-slate-200 rounded p-2.5 text-center">
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider">{s.label}</div>
                          <div className={`text-lg font-bold font-mono ${s.tone}`}>{s.value ?? 0}</div>
                        </div>
                      ))}
                    </div>
                    {jobResult.statusMessage && <p className="text-xs text-slate-600">{jobResult.statusMessage}</p>}
                  </>
                )}
              </div>
            )}
          </section>
        )}

        {/* ============================ STEP 4 — VERIFY ============================ */}
        {activeStep === 'verify' && (
          <section className="bg-white border border-slate-200 rounded">
            <header className="px-5 py-3 border-b border-slate-200">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Verification Results</h2>
            </header>
            {!jobResult ? (
              <div className="px-5 py-8 text-center">
                <p className="text-xs text-slate-600">No verification results available.</p>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { label: 'Generated Candidates', value: jobResult.generatedCount },
                    { label: 'Verified', value: jobResult.verifiedCount },
                    { label: 'Awaiting Review', value: jobResult.pendingReviewCount },
                    { label: 'Auto-published', value: jobResult.autoPublishedCount ?? 0 },
                    { label: 'Duplicates', value: jobResult.duplicateCount },
                    { label: 'Failed', value: jobResult.failedCount },
                  ].map((s) => (
                    <div key={s.label} className="border border-slate-200 rounded p-3 text-center">
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider leading-tight">{s.label}</div>
                      <div className="text-xl font-bold font-mono text-slate-900 mt-1">{s.value ?? 0}</div>
                    </div>
                  ))}
                </div>
                {jobResult.regenerationRounds > 0 && (
                  <p className="text-xs text-slate-600">
                    {jobResult.regenerationRounds} automatic regeneration round(s) were attempted to make up shortfalls.
                  </p>
                )}
                {jobResult.statusMessage && (
                  <div className="bg-slate-50 border border-slate-200 rounded p-3">
                    <p className="text-xs text-slate-700">{jobResult.statusMessage}</p>
                  </div>
                )}
                <div className="flex justify-end">
                  <button onClick={() => setActiveStep('review')} className="px-5 py-2 rounded bg-[#1E40AF] text-white text-xs font-semibold hover:bg-blue-800">
                    Review Questions →
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ============================ STEP 5 — REVIEW ============================ */}
        {activeStep === 'review' && (
          <section className="bg-white border border-slate-200 rounded">
            <header className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Question Review ({sortedReviewQuestions.length})
              </h2>
              {selectedQuestionIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">Selected: {selectedQuestionIds.size}</span>
                  <button onClick={() => setBulkConfirm('approve')} className="px-3 py-1.5 rounded bg-emerald-700 text-white text-[11px] font-semibold hover:bg-emerald-800">
                    Approve Selected
                  </button>
                  <button onClick={() => setBulkConfirm('reject')} className="px-3 py-1.5 rounded border border-red-300 text-red-700 text-[11px] font-semibold hover:bg-red-50">
                    Reject Selected
                  </button>
                  <button onClick={() => setSelectedQuestionIds(new Set())} className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 text-[11px] font-semibold hover:bg-slate-50">
                    Clear
                  </button>
                </div>
              )}
            </header>

            {sortedReviewQuestions.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-xs text-slate-600">No verified questions available.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-left text-slate-600">
                      <th className="px-3 py-2 w-8">
                        <input type="checkbox" className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer" checked={allReviewSelected} onChange={toggleSelectAllReview} />
                      </th>
                      <th className="px-3 py-2 font-semibold w-10">#</th>
                      <th className="px-3 py-2 font-semibold">Question</th>
                      <th className="px-3 py-2 font-semibold">Type</th>
                      <th className="px-3 py-2 font-semibold">Difficulty</th>
                      <th className="px-3 py-2 font-semibold">Verification</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedReviewQuestions.map((q, idx) => (
                      <tr key={q.id} className={selectedQuestionIds.has(q.id) ? 'bg-blue-50/40' : ''}>
                        <td className="px-3 py-2.5">
                          <input type="checkbox" className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer" checked={selectedQuestionIds.has(q.id)} onChange={() => toggleQuestionSelection(q.id)} />
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-500">{String(idx + 1).padStart(2, '0')}</td>
                        <td className="px-3 py-2.5 text-slate-900 max-w-md truncate" title={q.stem}>{q.stem}</td>
                        <td className="px-3 py-2.5"><span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[10px]">{q.type}</span></td>
                        <td className="px-3 py-2.5"><span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[10px]">{q.difficulty}</span></td>
                        <td className="px-3 py-2.5"><VerificationBadge status={q.verificationStatus} /></td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[10px] font-bold uppercase ${
                            q.status === 'APPROVED' ? 'text-emerald-700' : q.status === 'REJECTED' ? 'text-red-700' : 'text-slate-500'
                          }`}>{q.status}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <button onClick={() => setDetailQuestion(q)} className="px-2.5 py-1 rounded border border-slate-300 text-slate-700 text-[10px] font-semibold hover:bg-slate-50">
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {sortedReviewQuestions.length > 0 && (
              <div className="px-5 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-600">
                  Only verified/approved questions are eligible for a published question paper.
                </p>
                <a href="/admin/dashboard" className="px-4 py-2 rounded border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50">
                  Open Question Bank →
                </a>
              </div>
            )}
          </section>
        )}
      </div>

      {/* Question detail panel */}
      {detailQuestion && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" onClick={() => setDetailQuestion(null)}>
          <div className="bg-white rounded max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Question Detail</h3>
              <button onClick={() => setDetailQuestion(null)} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
            </header>
            <div className="p-5 space-y-4 text-xs">
              <div>
                <p className="text-slate-500 mb-1">Question</p>
                <p className="text-slate-900 font-medium leading-relaxed">{detailQuestion.stem}</p>
              </div>

              {Array.isArray(detailQuestion.options) && detailQuestion.options.length > 0 && (
                <div>
                  <p className="text-slate-500 mb-1.5">Options</p>
                  <div className="space-y-1.5">
                    {detailQuestion.options.map((opt: any, i: number) => {
                      const isCorrect = Array.isArray(detailQuestion.correctAnswer) && detailQuestion.correctAnswer.includes(i);
                      return (
                        <div key={i} className={`p-2 rounded border flex items-center justify-between ${isCorrect ? 'border-emerald-300 bg-emerald-50 font-semibold text-emerald-900' : 'border-slate-200 text-slate-700'}`}>
                          <span>{String.fromCharCode(65 + i)}. {typeof opt === 'string' ? opt : opt.text}</span>
                          {isCorrect && <Check className="w-3.5 h-3.5 text-emerald-700" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="border-t border-slate-100 pt-3">
                <p className="text-slate-500 mb-1">Correct Answer</p>
                <p className="text-slate-900 font-mono font-semibold">{JSON.stringify(detailQuestion.correctAnswer)}</p>
              </div>

              {detailQuestion.explanation && (
                <div className="border-t border-slate-100 pt-3">
                  <p className="text-slate-500 mb-1">Solution</p>
                  <p className="text-slate-700 leading-relaxed">{detailQuestion.explanation}</p>
                </div>
              )}

              {Array.isArray(detailQuestion.sourceDocumentIds) && detailQuestion.sourceDocumentIds.length > 0 && (
                <div className="border-t border-slate-100 pt-3">
                  <p className="text-slate-500 mb-1">Source</p>
                  <p className="text-slate-800">
                    {detailQuestion.sourceDocumentIds
                      .map((id: string) => documents.find((d) => d.id === id)?.title || id)
                      .join(', ')}
                  </p>
                </div>
              )}

              <div className="border-t border-slate-100 pt-3">
                <p className="text-slate-500 mb-1.5">Verification</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {detailQuestion.provenanceValid ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-red-600" />}
                    <span className="text-slate-700">Source grounded</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {detailQuestion.verificationStatus === 'PASS' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                    <span className="text-slate-700">Answer independently verified</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!detailQuestion.ambiguityDetected ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                    <span className="text-slate-700">No ambiguity detected</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {detailQuestion.similarityStatus === 'UNIQUE' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                    <span className="text-slate-700">Duplicate check: {detailQuestion.similarityStatus || 'n/a'}</span>
                  </div>
                </div>
              </div>
            </div>
            <footer className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2 sticky bottom-0 bg-white">
              {detailQuestion.status === 'PENDING_REVIEW' ? (
                <>
                  <button
                    onClick={() => handleReject(detailQuestion.id)}
                    disabled={actioningId === detailQuestion.id}
                    className="px-4 py-2 rounded border border-red-300 text-red-700 text-xs font-semibold hover:bg-red-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleApprove(detailQuestion.id)}
                    disabled={actioningId === detailQuestion.id}
                    className="px-4 py-2 rounded bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {actioningId === detailQuestion.id ? 'Working...' : 'Approve'}
                  </button>
                </>
              ) : (
                <span className={`px-3 py-1.5 rounded text-xs font-semibold ${
                  detailQuestion.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
                }`}>{detailQuestion.status}</span>
              )}
            </footer>
          </div>
        </div>
      )}

      {/* Bulk action confirmation */}
      {bulkConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded max-w-md w-full">
            <header className="px-5 py-3 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">
                {bulkConfirm === 'approve' ? 'Approve' : 'Reject'} {selectedQuestionIds.size} selected question{selectedQuestionIds.size === 1 ? '' : 's'}?
              </h3>
            </header>
            <div className="p-5">
              <p className="text-xs text-slate-600">
                {bulkConfirm === 'approve'
                  ? 'Approved questions are published to the live Question Bank and become eligible for question papers.'
                  : 'Rejected questions are excluded from the Question Bank. This does not delete the generation record.'}
              </p>
            </div>
            <footer className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setBulkConfirm(null)} disabled={isBulkActing} className="px-4 py-2 rounded border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50">
                Cancel
              </button>
              <button
                onClick={handleBulkAction}
                disabled={isBulkActing}
                className={`px-4 py-2 rounded text-white text-xs font-semibold disabled:opacity-50 ${bulkConfirm === 'approve' ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-red-700 hover:bg-red-800'}`}
              >
                {isBulkActing ? 'Working...' : bulkConfirm === 'approve' ? 'Approve Questions' : 'Reject Questions'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};
