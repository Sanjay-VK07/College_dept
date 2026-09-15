'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Layers,
  Sliders,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Calendar,
  Send,
  HelpCircle,
  Search,
} from 'lucide-react';
import api from '@/lib/api';
import { ExamPreviewModal } from './ExamPreviewModal';

interface SmartQuestionPaperBuilderProps {
  role?: string;
  /** Pre-populate the paper with these questions (e.g. from a Question Bank bulk selection) and
   * jump straight to the review step. Full question objects, not just ids — reuses whatever the
   * caller already has loaded rather than a second fetch. All must already be VERIFIED; callers
   * are responsible for that guard, this component trusts what it's given. */
  initialSelectedQuestions?: any[];
  onExitToQuestionBank?: () => void;
}

type StepId = 'resources' | 'topics' | 'configure' | 'generate' | 'review';

const STEPS: Array<{ id: StepId; index: string; label: string }> = [
  { id: 'resources', index: '01', label: 'Resources' },
  { id: 'topics', index: '02', label: 'Topics' },
  { id: 'configure', index: '03', label: 'Configure' },
  { id: 'generate', index: '04', label: 'Generate' },
  { id: 'review', index: '05', label: 'Review' },
];

/** Apportions numbers using largest-remainder algorithm */
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

// Draft persistence — the paper-building wizard is real user work (topic selection, question
// picks, exam settings) that previously lived only in React state and vanished the moment the
// component unmounted (switching to another sidebar section, tab, or a page refresh). This
// autosaves to localStorage and restores on mount so that work survives navigation.
const PAPER_DRAFT_STORAGE_KEY = 'gsmas_question_paper_draft_v1';

interface QuestionPaperDraft {
  activeStep: StepId;
  selectedSubjectId: string;
  selectedTopicIds: string[];
  paperMode: 'TOTAL_COUNT' | 'TOPIC_BLUEPRINT';
  totalQuestions: number;
  topicBlueprint: Record<string, number>;
  generationMode: 'EXISTING_ONLY' | 'GENERATE_MISSING';
  easyPercent: number;
  medPercent: number;
  hardPercent: number;
  mcqPercent: number;
  msqPercent: number;
  natPercent: number;
  negativeMarking: boolean;
  solutionVisibility: string;
  sourceReferences: boolean;
  previewData: any | null;
  paperQuestions: any[];
  selectedQuestionIds: string[];
  examSettings: {
    title: string;
    description: string;
    targetDepartment: string;
    durationMinutes: number;
    totalMarks: number;
    instructions: string;
  };
}

function loadPaperDraft(): Partial<QuestionPaperDraft> | null {
  try {
    const raw = localStorage.getItem(PAPER_DRAFT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePaperDraft(draft: QuestionPaperDraft) {
  try {
    localStorage.setItem(PAPER_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* localStorage unavailable (private browsing, quota) — draft simply won't persist */
  }
}

function clearPaperDraft() {
  try {
    localStorage.removeItem(PAPER_DRAFT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export const SmartQuestionPaperBuilder: React.FC<SmartQuestionPaperBuilderProps> = ({
  role = 'FACULTY',
  initialSelectedQuestions,
  onExitToQuestionBank,
}) => {
  const hasInitialSelection = !!initialSelectedQuestions && initialSelectedQuestions.length > 0;
  const [savedDraft] = useState(loadPaperDraft);
  // An explicit "build from these selected questions" action always wins over a stale restored
  // draft — the user just took a deliberate new action, not resuming an old one.
  const [hasRestoredDraft] = useState(() => !hasInitialSelection && savedDraft !== null);

  const [activeStep, setActiveStep] = useState<StepId>(
    hasInitialSelection ? 'review' : savedDraft?.activeStep || 'resources'
  );

  // Governance & Bounds
  const [minCount] = useState(1);
  const [maxCount] = useState(500);

  // Step 1 — Resources (source material for AI-shortfall RAG grounding — a different concern
  // from bulk question import, which now lives in Question Bank -> Import / Extract)
  const [documents, setDocuments] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 — Subject & Topics Availability Matrix (Real DB counts)
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(savedDraft?.selectedSubjectId || '');
  const [topicAvailability, setTopicAvailability] = useState<any[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>(savedDraft?.selectedTopicIds || []);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Step 3 — Paper Configuration (Mode A: Total Count vs Mode B: Topic Blueprint)
  const [paperMode, setPaperMode] = useState<'TOTAL_COUNT' | 'TOPIC_BLUEPRINT'>(savedDraft?.paperMode || 'TOTAL_COUNT');
  const [totalQuestions, setTotalQuestions] = useState<number>(savedDraft?.totalQuestions ?? 50);
  const [topicBlueprint, setTopicBlueprint] = useState<Record<string, number>>(savedDraft?.topicBlueprint || {});
  const [generationMode, setGenerationMode] = useState<'EXISTING_ONLY' | 'GENERATE_MISSING'>(savedDraft?.generationMode || 'GENERATE_MISSING');

  // Distribution
  const [easyPercent, setEasyPercent] = useState(savedDraft?.easyPercent ?? 20);
  const [medPercent, setMedPercent] = useState(savedDraft?.medPercent ?? 50);
  const [hardPercent, setHardPercent] = useState(savedDraft?.hardPercent ?? 30);
  const [mcqPercent, setMcqPercent] = useState(savedDraft?.mcqPercent ?? 60);
  const [msqPercent, setMsqPercent] = useState(savedDraft?.msqPercent ?? 10);
  const [natPercent, setNatPercent] = useState(savedDraft?.natPercent ?? 30);

  const [negativeMarking, setNegativeMarking] = useState(savedDraft?.negativeMarking ?? true);
  const [solutionVisibility, setSolutionVisibility] = useState(savedDraft?.solutionVisibility || 'SHOW_AFTER_RESULT');
  const [sourceReferences, setSourceReferences] = useState(savedDraft?.sourceReferences ?? true);

  // Step 4 — Preview & Async Shortfall Job State
  const [previewData, setPreviewData] = useState<any | null>(savedDraft?.previewData ?? null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isGeneratingShortfall, setIsGeneratingShortfall] = useState(false);
  const [shortfallJobId, setShortfallJobId] = useState<string | null>(null);
  const [shortfallJobStatus, setShortfallJobStatus] = useState<string | null>(null);
  const [shortfallJobMessage, setShortfallJobMessage] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Step 5 — Review Table & Final Exam Draft
  const [paperQuestions, setPaperQuestions] = useState<any[]>(
    hasInitialSelection ? initialSelectedQuestions! : savedDraft?.paperQuestions || []
  );
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(
    new Set(hasInitialSelection ? initialSelectedQuestions!.map((q: any) => q.id) : savedDraft?.selectedQuestionIds || [])
  );

  // Finalized Exam Draft State
  const [finalizedExam, setFinalizedExam] = useState<any | null>(null);
  const [showFinalizedQuestions, setShowFinalizedQuestions] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [examSettings, setExamSettings] = useState(
    savedDraft?.examSettings || {
      title: '',
      description: '',
      targetDepartment: '',
      durationMinutes: 180,
      totalMarks: 100,
      instructions: 'Read all questions carefully. Negative marking applies to incorrect MCQ answers.',
    }
  );

  const [toast, setToast] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 5000);
  };

  const handleStartNewPaper = () => {
    clearPaperDraft();
    setActiveStep('resources');
    setSelectedTopicIds([]);
    setPaperMode('TOTAL_COUNT');
    setTotalQuestions(50);
    setTopicBlueprint({});
    setGenerationMode('GENERATE_MISSING');
    setEasyPercent(20);
    setMedPercent(50);
    setHardPercent(30);
    setMcqPercent(60);
    setMsqPercent(10);
    setNatPercent(30);
    setNegativeMarking(true);
    setSolutionVisibility('SHOW_AFTER_RESULT');
    setSourceReferences(true);
    setPreviewData(null);
    setPaperQuestions([]);
    setSelectedQuestionIds(new Set());
    setFinalizedExam(null);
    setExamSettings({
      title: '',
      description: '',
      targetDepartment: '',
      durationMinutes: 180,
      totalMarks: 100,
      instructions: 'Read all questions carefully. Negative marking applies to incorrect MCQ answers.',
    });
    showToast('Started a new paper — previous draft discarded.');
  };

  // Let the user know their previous in-progress paper was restored, once, on mount.
  useEffect(() => {
    if (hasRestoredDraft) {
      showToast('Restored your in-progress question paper draft.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave the wizard's real user work (selections, generated preview, assembled paper) so
  // switching sections/tabs — which unmounts this component — doesn't discard it. Debounced
  // since several of these fields (percent inputs, question counts) can change in quick bursts.
  useEffect(() => {
    const t = setTimeout(() => {
      savePaperDraft({
        activeStep,
        selectedSubjectId,
        selectedTopicIds,
        paperMode,
        totalQuestions,
        topicBlueprint,
        generationMode,
        easyPercent,
        medPercent,
        hardPercent,
        mcqPercent,
        msqPercent,
        natPercent,
        negativeMarking,
        solutionVisibility,
        sourceReferences,
        previewData,
        paperQuestions,
        selectedQuestionIds: Array.from(selectedQuestionIds),
        examSettings,
      });
    }, 400);
    return () => clearTimeout(t);
  }, [
    activeStep,
    selectedSubjectId,
    selectedTopicIds,
    paperMode,
    totalQuestions,
    topicBlueprint,
    generationMode,
    easyPercent,
    medPercent,
    hardPercent,
    mcqPercent,
    msqPercent,
    natPercent,
    negativeMarking,
    solutionVisibility,
    sourceReferences,
    previewData,
    paperQuestions,
    selectedQuestionIds,
    examSettings,
  ]);

  // Load Resources & Subjects on Mount
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

  // A ref (not a dependency) so this callback keeps a stable identity across subject changes —
  // it previously depended on `selectedSubjectId` directly, which meant selecting any subject
  // recreated `loadSubjects`, re-triggered the mount effect below, and refired the subjects list
  // fetch repeatedly. That request storm was racing the topic-availability fetch for the subject
  // the user had just picked, which is what caused the wrong/empty topics found live via UI
  // testing — the previous stale-response guard alone wasn't enough while this kept firing.
  const selectedSubjectIdRef = useRef(selectedSubjectId);
  useEffect(() => {
    selectedSubjectIdRef.current = selectedSubjectId;
  }, [selectedSubjectId]);

  const loadSubjects = useCallback(async () => {
    try {
      const res = await aiService.getQuestionBankSubjects();
      if (res?.success && res.data?.length > 0) {
        setSubjects(res.data);
        if (!selectedSubjectIdRef.current) setSelectedSubjectId(res.data[0].id);
      }
    } catch (e: any) {
      console.error('Failed to load subjects:', e);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
    loadSubjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only — loadDocuments/loadSubjects now have stable identities

  // Load Topic Availability Matrix when subject changes. Guarded against out-of-order
  // responses: switching subjects quickly (e.g. the initial default-subject load racing a
  // user's immediate explicit selection) could let an older, slower request resolve after a
  // newer one and silently overwrite the correct topics with the previous subject's — found
  // live via UI testing (selecting a 251-question subject showed one unrelated 0-question topic
  // from the subject that had loaded by default before it).
  const latestSubjectRequestRef = useRef<string | null>(null);
  const loadTopicAvailability = useCallback(async (subjId: string) => {
    if (!subjId) return;
    latestSubjectRequestRef.current = subjId;
    setLoadingTopics(true);
    try {
      const res = await aiService.getTopicAvailability(subjId);
      if (latestSubjectRequestRef.current !== subjId) return; // a newer request has since superseded this one
      if (res?.success) {
        setTopicAvailability(res.data || []);
        setSelectedTopicIds((res.data || []).map((t: any) => t.topicId));
      }
    } catch (e: any) {
      if (latestSubjectRequestRef.current !== subjId) return;
      setErrorMsg(e.response?.data?.message || 'Failed to load topic availability.');
    } finally {
      if (latestSubjectRequestRef.current === subjId) setLoadingTopics(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSubjectId) {
      loadTopicAvailability(selectedSubjectId);
    }
  }, [selectedSubjectId, loadTopicAvailability]);

  // Clean up poll timer on unmount
  useEffect(() => () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); }, []);

  // Filter topic matrix by search query
  const filteredTopicAvailability = topicAvailability.filter((t) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = t.topicName.toLowerCase().includes(q);
      if (!matchName) return false;
    }
    if (statusFilter === 'VERIFIED_ONLY') return t.verified > 0;
    if (statusFilter === 'NEEDS_REVIEW_ONLY') return t.needsReview > 0;
    if (statusFilter === 'UNANSWERED_ONLY') return t.unansweredInSource > 0;
    return true;
  });

  // Calculate live availability summary across selected topics
  const selectedTopicsInfo = topicAvailability.filter((t) => selectedTopicIds.includes(t.topicId));
  const totalVerifiedAvailable = selectedTopicsInfo.reduce((sum, t) => sum + t.verified, 0);
  const totalSourceQuestionsAvailable = selectedTopicsInfo.reduce((sum, t) => sum + t.sourceQuestions, 0);
  const totalAIGeneratedAvailable = selectedTopicsInfo.reduce((sum, t) => sum + t.aiGenerated, 0);
  const totalNeedsReviewAvailable = selectedTopicsInfo.reduce((sum, t) => sum + t.needsReview, 0);

  // Distribution target calculation helpers
  const diffSum = easyPercent + medPercent + hardPercent;
  const typeSum = mcqPercent + msqPercent + natPercent;

  // Handle Paper Preview calculation
  const handleCalculatePreview = async () => {
    setErrorMsg(null);
    if (selectedTopicIds.length === 0) {
      setErrorMsg('Please select at least one topic.');
      return;
    }
    if (diffSum !== 100 || typeSum !== 100) {
      setErrorMsg('Percentages for difficulty and question type must total exactly 100%.');
      return;
    }

    setIsLoadingPreview(true);
    try {
      const res = await aiService.previewQuestionPaper({
        subjectId: selectedSubjectId,
        selectedTopicIds,
        paperMode,
        totalQuestions,
        topicBlueprint,
        difficultyDistribution: { EASY: easyPercent, MEDIUM: medPercent, HARD: hardPercent },
        typeDistribution: { MCQ: mcqPercent, MSQ: msqPercent, NAT: natPercent },
      });

      if (res?.success) {
        setPreviewData(res.data);
        setPaperQuestions(res.data.selectedQuestions || []);
        setSelectedQuestionIds(new Set((res.data.selectedQuestions || []).map((q: any) => q.id)));
        setActiveStep('configure');
      }
    } catch (e: any) {
      setErrorMsg(e.response?.data?.message || 'Failed to calculate paper preview.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Handle Async Shortfall AI Generation
  const handleStartShortfallJob = async () => {
    setErrorMsg(null);
    if (!previewData) return;

    if (previewData.aiRequiredCount === 0) {
      setActiveStep('review');
      return;
    }

    setIsGeneratingShortfall(true);
    setShortfallJobStatus('QUEUED');
    setShortfallJobMessage('Queued shortfall generation job...');
    setActiveStep('generate');

    try {
      const res = await aiService.startShortfallGeneration({
        subjectId: selectedSubjectId,
        selectedTopicIds,
        paperMode,
        totalQuestions,
        topicBlueprint,
        difficultyDistribution: { EASY: easyPercent, MEDIUM: medPercent, HARD: hardPercent },
        typeDistribution: { MCQ: mcqPercent, MSQ: msqPercent, NAT: natPercent },
      });

      if (!res?.success) {
        setErrorMsg(res?.message || 'Shortfall generation request was rejected.');
        setShortfallJobStatus('FAILED');
        setIsGeneratingShortfall(false);
        return;
      }

      const jobId = res.data.jobId;
      setShortfallJobId(jobId);
      pollShortfallJob(jobId);
    } catch (e: any) {
      setErrorMsg(e.response?.data?.message || 'Failed to start shortfall generation.');
      setShortfallJobStatus('FAILED');
      setIsGeneratingShortfall(false);
    }
  };

  const pollShortfallJob = (jobId: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await aiService.getShortfallJobStatus(jobId);
        if (!res?.success) return;
        const job = res.job;
        setShortfallJobStatus(job.status);
        setShortfallJobMessage(job.statusMessage);

        if (['COMPLETED', 'FAILED'].includes(job.status)) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          setIsGeneratingShortfall(false);

          if (job.status === 'FAILED') {
            setErrorMsg(job.statusMessage || 'Shortfall generation failed.');
          } else {
            const updatedPreview = await aiService.previewQuestionPaper({
              subjectId: selectedSubjectId,
              selectedTopicIds,
              paperMode,
              totalQuestions,
              topicBlueprint,
              difficultyDistribution: { EASY: easyPercent, MEDIUM: medPercent, HARD: hardPercent },
              typeDistribution: { MCQ: mcqPercent, MSQ: msqPercent, NAT: natPercent },
            });
            if (updatedPreview?.success) {
              setPreviewData(updatedPreview.data);
              setPaperQuestions(updatedPreview.data.selectedQuestions || []);
              setSelectedQuestionIds(new Set((updatedPreview.data.selectedQuestions || []).map((q: any) => q.id)));
            }
            setActiveStep('review');
          }
        }
      } catch (err: any) {
        console.error('[ShortfallPoll] Error:', err.message);
      }
    }, 3000);
  };

  // Finalize Paper into MockTest DRAFT (Never auto-published!)
  const handleFinalizePaper = async () => {
    setErrorMsg(null);
    const selectedIds = Array.from(selectedQuestionIds);
    if (selectedIds.length === 0) {
      setErrorMsg('Please select at least one question for the paper.');
      return;
    }

    setIsFinalizing(true);
    try {
      const selectedSubject = subjects.find((s) => s.id === selectedSubjectId);
      const res = await aiService.finalizeQuestionPaper({
        title: examSettings.title || `GATE ${selectedSubject?.name || 'Subject'} Examination Paper`,
        description: examSettings.description || 'Assembled question paper using approved Question Bank questions.',
        subjectId: selectedSubjectId,
        selectedQuestionIds: selectedIds,
        examSettings: {
          targetDepartment: examSettings.targetDepartment || selectedSubject?.department || 'Computer Science and Engineering',
          durationMinutes: examSettings.durationMinutes,
          totalMarks: examSettings.totalMarks,
          negativeMarking,
          solutionVisibility,
          instructions: examSettings.instructions,
        },
      });

      if (res?.success) {
        setFinalizedExam(res.mockTest);
        // The paper is now safely persisted server-side as a MockTest — the local wizard draft
        // has served its purpose and would otherwise linger and get "restored" into a new,
        // unrelated paper next time this screen is opened.
        clearPaperDraft();
        showToast('Question paper finalized! MockTest draft created in database.');
      }
    } catch (e: any) {
      setErrorMsg(e.response?.data?.message || 'Failed to finalize question paper.');
    } finally {
      setIsFinalizing(false);
    }
  };

  // Explicit Publication Action
  const handlePublishExamination = async () => {
    if (!finalizedExam) return;
    setIsPublishing(true);
    try {
      const res = await aiService.publishExamination(finalizedExam.id);
      if (res?.success) {
        setFinalizedExam(res.mockTest);
        showToast('Examination explicitly published for students!');
      }
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Failed to publish examination.');
    } finally {
      setIsPublishing(false);
    }
  };

  // Question Deletion with Safety Check
  const handleDeleteQuestion = async (qId: string) => {
    try {
      await aiService.deleteQuestionBankQuestion(qId);
      setPaperQuestions((prev) => prev.filter((q) => q.id !== qId));
      setSelectedQuestionIds((prev) => {
        const next = new Set(prev);
        next.delete(qId);
        return next;
      });
      showToast('Question removed.');
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Cannot delete question.');
    }
  };

  // Handle Resource Upload
  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrorMsg(null);
    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const res = await aiService.uploadDocument(file, file.name, 'FACULTY');
        const newDocId = res?.data?.id;
        if (newDocId) {
          try {
            await aiService.processDocumentStructure(newDocId);
          } catch (e: any) {
            showToast(`Uploaded "${file.name}", but structure extraction could not be queued.`);
          }
        }
      }
      showToast('Upload complete. Structure extraction is running in background.');
      loadDocuments();
    } catch (e: any) {
      setErrorMsg(e.response?.data?.message || 'Upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  const VerificationBadge = ({ status, origin }: { status?: string; origin?: string }) => (
    <div className="flex items-center gap-1">
      {origin === 'AI_GENERATED' ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
          <Sparkles className="w-3 h-3" /> AI
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          <FileText className="w-3 h-3" /> Source
        </span>
      )}
      {status === 'VERIFIED' ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" /> Verified
        </span>
      ) : status === 'UNANSWERED_IN_SOURCE' ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">
          <HelpCircle className="w-3 h-3" /> Unanswered in Source
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="w-3 h-3" /> Needs Review
        </span>
      )}
    </div>
  );

  return (
    <div className="bg-slate-50 min-h-full">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded shadow-lg max-w-md">
          {toast}
        </div>
      )}

      {/* Institutional Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-base font-bold text-slate-900 uppercase tracking-wide">
              Smart Question Paper Builder
            </h1>
            <p className="text-xs text-slate-600 mt-1 max-w-3xl">
              Intelligent, availability-aware examination authoring from normalized Question Bank &amp; indexed source material.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onExitToQuestionBank && (
              <button
                onClick={onExitToQuestionBank}
                className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all flex items-center gap-1.5"
              >
                ← Back to Question Bank
              </button>
            )}
          </div>
        </div>

        {/* 5-Step Indicator */}
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
          {(activeStep !== 'resources' || selectedTopicIds.length > 0 || paperQuestions.length > 0) && (
            <button
              type="button"
              onClick={handleStartNewPaper}
              title="Discard this in-progress paper and start over"
              className="ml-auto text-xs text-slate-500 hover:text-red-700 hover:underline whitespace-nowrap"
            >
              Start New Paper
            </button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-5">
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded p-3 flex items-start gap-2.5 text-red-800">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="text-xs">{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="ml-auto text-red-400 hover:text-red-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ============================ STEP 1 — RESOURCES ============================ */}
        {activeStep === 'resources' && (
          <div className="space-y-5">
            <section className="bg-white border border-slate-200 rounded">
              <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Source Resources</h2>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded bg-blue-700 text-white text-xs font-bold hover:bg-blue-800 flex items-center gap-1 cursor-pointer"
                >
                  <UploadCloud className="w-3.5 h-3.5" /> Upload Resource
                </button>
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
                  <p className="text-sm font-semibold text-slate-800">Upload academic resources or Question Bank files</p>
                  <p className="text-xs text-slate-500 mt-1">Drag &amp; drop PDF / e-book / JSONL files</p>
                  <p className="text-[11px] text-slate-400 mt-2">Supported: PDF • Scanned PDF • JSONL Question Banks</p>
                  <div className="flex items-center justify-center gap-3 mt-4">
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded bg-[#1E40AF] text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-50"
                    >
                      {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                      {isUploading ? 'Uploading...' : 'Browse Resources'}
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
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded">
              <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Uploaded Resources ({documents.length})
                </h2>
                <div className="flex items-center gap-2">
                  <button onClick={loadDocuments} disabled={loadingDocs} className="text-xs text-blue-700 hover:underline flex items-center gap-1 disabled:opacity-50">
                    <RefreshCw className={`w-3 h-3 ${loadingDocs ? 'animate-spin' : ''}`} /> Refresh
                  </button>
                  <button
                    onClick={() => setActiveStep('topics')}
                    className="px-4 py-1.5 rounded bg-[#1E40AF] text-white text-xs font-semibold hover:bg-blue-800 flex items-center gap-1"
                  >
                    Next: Topic Availability <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </header>

              {documents.length === 0 ? (
                <div className="px-5 py-6 text-center">
                  <p className="text-xs font-semibold text-slate-700">No resources uploaded yet.</p>
                  <p className="text-xs text-slate-500 mt-1">Upload a GATE-related resource or JSONL Question Bank to begin.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr className="text-left text-slate-600">
                        <th className="px-3 py-2 font-semibold">Resource Name</th>
                        <th className="px-3 py-2 font-semibold">Type</th>
                        <th className="px-3 py-2 font-semibold">Pages</th>
                        <th className="px-3 py-2 font-semibold">Processing Status</th>
                        <th className="px-3 py-2 font-semibold">Detected Questions</th>
                        <th className="px-3 py-2 font-semibold">Uploaded</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {documents.map((doc) => {
                        const job = doc.processingJob;
                        const isReady = job?.status === 'COMPLETED' || doc.status === 'READY';
                        return (
                          <tr key={doc.id}>
                            <td className="px-3 py-2.5 font-semibold text-slate-900">{doc.title}</td>
                            <td className="px-3 py-2.5 text-slate-600">{doc.mimeType?.includes('pdf') ? 'PDF' : doc.mimeType || '—'}</td>
                            <td className="px-3 py-2.5 font-mono text-slate-700">{job?.totalPages || '—'}</td>
                            <td className="px-3 py-2.5">
                              {isReady ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                  <CheckCircle2 className="w-3 h-3" /> Ready
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-blue-700 font-semibold">
                                  <Loader2 className="w-3 h-3 animate-spin" /> Processing
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-slate-700">{job?.questionsFound || 0} extracted</td>
                            <td className="px-3 py-2.5 font-mono text-slate-500">{new Date(doc.createdAt).toLocaleDateString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ============================ STEP 2 — TOPIC AVAILABILITY MATRIX ============================ */}
        {activeStep === 'topics' && (
          <div className="space-y-5">
            {/* Subject Selector & Live Availability Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-3 bg-white border border-slate-200 rounded p-5 space-y-3">
                <label className="block text-xs font-bold uppercase text-slate-700 tracking-wider">Select Subject</label>
                <select
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded text-xs font-semibold text-slate-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code}) — {s.totalTopics} Topics / {s.totalQuestions} Questions
                    </option>
                  ))}
                </select>

                {/* Filter and Search Bar */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search topic or ID (e.g. 1.5.41 or Cache Memory)..."
                      className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded text-xs focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded text-xs bg-white text-slate-700 font-semibold"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="VERIFIED_ONLY">Verified Only</option>
                    <option value="NEEDS_REVIEW_ONLY">Needs Review Only</option>
                    <option value="UNANSWERED_ONLY">Unanswered Only</option>
                  </select>
                </div>
              </div>

              {/* Live Metric Summary Panel */}
              <div className="bg-slate-900 text-white rounded p-4 flex flex-col justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Selection Summary</div>
                  <div className="mt-2 space-y-1 font-mono text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Selected Topics:</span>
                      <span className="font-bold text-white">{selectedTopicIds.length}</span>
                    </div>
                    <div className="flex justify-between text-emerald-400">
                      <span>Verified Available:</span>
                      <span className="font-bold">{totalVerifiedAvailable}</span>
                    </div>
                    <div className="flex justify-between text-blue-400">
                      <span>Source Questions:</span>
                      <span className="font-bold">{totalSourceQuestionsAvailable}</span>
                    </div>
                    <div className="flex justify-between text-purple-400">
                      <span>AI Generated:</span>
                      <span className="font-bold">{totalAIGeneratedAvailable}</span>
                    </div>
                    <div className="flex justify-between text-amber-400">
                      <span>Needs Review:</span>
                      <span className="font-bold">{totalNeedsReviewAvailable}</span>
                    </div>
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 mt-3 pt-2 border-t border-slate-800">
                  Only VERIFIED questions count toward immediately usable question pool.
                </div>
              </div>
            </div>

            {/* Real DB-Driven Topic Matrix */}
            <section className="bg-white border border-slate-200 rounded">
              <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Indexed Question Bank Topics ({filteredTopicAvailability.length})
                </h2>
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filteredTopicAvailability.length > 0 && selectedTopicIds.length === filteredTopicAvailability.length}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedTopicIds(filteredTopicAvailability.map((t) => t.topicId));
                        else setSelectedTopicIds([]);
                      }}
                      className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    Select All Filtered
                  </label>
                  <button
                    onClick={handleCalculatePreview}
                    disabled={selectedTopicIds.length === 0}
                    className="px-4 py-1.5 rounded bg-[#1E40AF] text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-50 flex items-center gap-1"
                  >
                    Configure Paper <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </header>

              {loadingTopics ? (
                <div className="p-8 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> Querying PostgreSQL topic availability...
                </div>
              ) : filteredTopicAvailability.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No topics available for this subject in the database.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-left">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold w-10">Select</th>
                        <th className="px-4 py-2.5 font-semibold">Topic Name</th>
                        <th className="px-4 py-2.5 font-semibold text-center">Total</th>
                        <th className="px-4 py-2.5 font-semibold text-center">Verified</th>
                        <th className="px-4 py-2.5 font-semibold text-center">Needs Review</th>
                        <th className="px-4 py-2.5 font-semibold text-center">Source Qs</th>
                        <th className="px-4 py-2.5 font-semibold text-center">AI Qs</th>
                        <th className="px-4 py-2.5 font-semibold text-center">MCQ / MSQ / NAT</th>
                        <th className="px-4 py-2.5 font-semibold text-center">Easy / Med / Hard</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTopicAvailability.map((t) => {
                        const isSelected = selectedTopicIds.includes(t.topicId);
                        return (
                          <tr key={t.topicId} className={isSelected ? 'bg-blue-50/40' : ''}>
                            <td className="px-4 py-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedTopicIds((prev) => [...prev, t.topicId]);
                                  else setSelectedTopicIds((prev) => prev.filter((id) => id !== t.topicId));
                                }}
                                className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>
                            <td className="px-4 py-2.5 font-semibold text-slate-900">
                              {t.topicName}
                              {!t.hasSourceMaterial && (
                                <span className="ml-2 text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                  No Source Material
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-center">{t.total}</td>
                            <td className="px-4 py-2.5 font-mono text-center font-bold text-emerald-700">
                              {t.verified > 0 ? (
                                <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                                  {t.verified} verified
                                </span>
                              ) : (
                                <span className="text-slate-400">No verified questions</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-center text-amber-700">{t.needsReview}</td>
                            <td className="px-4 py-2.5 font-mono text-center text-blue-700">{t.sourceQuestions}</td>
                            <td className="px-4 py-2.5 font-mono text-center text-purple-700">{t.aiGenerated}</td>
                            <td className="px-4 py-2.5 font-mono text-center text-slate-600">
                              {t.types.MCQ} / {t.types.MSQ} / {t.types.NAT}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-center text-slate-600">
                              {t.difficulty.EASY} / {t.difficulty.MEDIUM} / {t.difficulty.HARD}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ============================ STEP 3 — CONFIGURATION & SHORTFALL CHECK ============================ */}
        {activeStep === 'configure' && (
          <div className="space-y-5">
            {/* Mode Selection */}
            <div className="bg-white border border-slate-200 rounded p-5 space-y-4">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Paper Assembly Mode</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label
                  onClick={() => setPaperMode('TOTAL_COUNT')}
                  className={`p-4 border rounded cursor-pointer transition-colors ${
                    paperMode === 'TOTAL_COUNT' ? 'border-blue-600 bg-blue-50/50' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
                    <input type="radio" checked={paperMode === 'TOTAL_COUNT'} onChange={() => {}} className="text-blue-600" />
                    MODE A — Total Question Count
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Faculty enters a single total count. The system selects across all selected topics according to distribution.
                  </p>
                </label>

                <label
                  onClick={() => setPaperMode('TOPIC_BLUEPRINT')}
                  className={`p-4 border rounded cursor-pointer transition-colors ${
                    paperMode === 'TOPIC_BLUEPRINT' ? 'border-blue-600 bg-blue-50/50' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
                    <input type="radio" checked={paperMode === 'TOPIC_BLUEPRINT'} onChange={() => {}} className="text-blue-600" />
                    MODE B — Topic-Wise Blueprint
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Faculty specifies exact required question count per selected topic. Validates each topic independently.
                  </p>
                </label>
              </div>
            </div>

            {/* Custom Question Count & Blueprint inputs */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded p-5 space-y-4">
                {paperMode === 'TOTAL_COUNT' ? (
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700 tracking-wider mb-2">Total Questions</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min={minCount}
                        max={maxCount}
                        value={totalQuestions}
                        onChange={(e) => setTotalQuestions(Math.max(minCount, Math.min(maxCount, Number(e.target.value))))}
                        className="w-32 px-3 py-2 border border-slate-300 rounded font-mono text-sm font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-xs text-slate-500">Configured bounds: {minCount} min – {maxCount} max</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <label className="block text-xs font-bold uppercase text-slate-700 tracking-wider">Topic Blueprint Allocation</label>
                    {selectedTopicsInfo.map((t) => (
                      <div key={t.topicId} className="flex items-center justify-between gap-3 text-xs py-1 border-b border-slate-100">
                        <span className="font-semibold text-slate-800">{t.topicName}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500">Available: {t.verified}</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={topicBlueprint[t.topicId] || 0}
                            onChange={(e) => setTopicBlueprint({ ...topicBlueprint, [t.topicId]: Math.max(0, Number(e.target.value)) })}
                            className="w-20 px-2 py-1 border border-slate-300 rounded font-mono text-right text-xs"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Difficulty Distribution */}
                <div className="pt-4 border-t border-slate-200">
                  <label className="block text-xs font-bold uppercase text-slate-700 tracking-wider mb-2">Difficulty Distribution (Sum 100%)</label>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-slate-600 font-medium">Easy %</span>
                      <input type="number" value={easyPercent} onChange={(e) => setEasyPercent(Number(e.target.value))} className="w-full p-2 border rounded font-mono mt-1" />
                    </div>
                    <div>
                      <span className="text-slate-600 font-medium">Medium %</span>
                      <input type="number" value={medPercent} onChange={(e) => setMedPercent(Number(e.target.value))} className="w-full p-2 border rounded font-mono mt-1" />
                    </div>
                    <div>
                      <span className="text-slate-600 font-medium">Hard %</span>
                      <input type="number" value={hardPercent} onChange={(e) => setHardPercent(Number(e.target.value))} className="w-full p-2 border rounded font-mono mt-1" />
                    </div>
                  </div>
                </div>

                {/* Question Type Distribution */}
                <div className="pt-4 border-t border-slate-200">
                  <label className="block text-xs font-bold uppercase text-slate-700 tracking-wider mb-2">Question Type Distribution (Sum 100%)</label>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-slate-600 font-medium">MCQ %</span>
                      <input type="number" value={mcqPercent} onChange={(e) => setMcqPercent(Number(e.target.value))} className="w-full p-2 border rounded font-mono mt-1" />
                    </div>
                    <div>
                      <span className="text-slate-600 font-medium">MSQ %</span>
                      <input type="number" value={msqPercent} onChange={(e) => setMsqPercent(Number(e.target.value))} className="w-full p-2 border rounded font-mono mt-1" />
                    </div>
                    <div>
                      <span className="text-slate-600 font-medium">NAT %</span>
                      <input type="number" value={natPercent} onChange={(e) => setNatPercent(Number(e.target.value))} className="w-full p-2 border rounded font-mono mt-1" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Preview & Shortfall Calculation Panel */}
              <div className="bg-slate-900 text-white rounded p-5 flex flex-col justify-between space-y-4">
                <div>
                  <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Availability &amp; Shortfall Analysis</h3>
                  {previewData ? (
                    <div className="mt-3 space-y-2 font-mono text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Required Questions:</span>
                        <span className="font-bold text-white">{previewData.requestedTotal}</span>
                      </div>
                      <div className="flex justify-between text-emerald-400">
                        <span>Selected Existing:</span>
                        <span className="font-bold">{previewData.selectedExistingCount}</span>
                      </div>
                      <div className="flex justify-between text-amber-400">
                        <span>Shortfall Total:</span>
                        <span className="font-bold">{previewData.aiRequiredCount}</span>
                      </div>

                      {previewData.aiRequiredCount > 0 ? (
                        <div className="mt-3 p-3 bg-amber-950/60 border border-amber-800 rounded text-amber-200 text-[11px]">
                          ⚠ {previewData.aiRequiredCount} additional questions required from AI generation.
                        </div>
                      ) : (
                        <div className="mt-3 p-3 bg-emerald-950/60 border border-emerald-800 rounded text-emerald-200 text-[11px]">
                          ✓ All {previewData.requestedTotal} questions can be created from existing verified questions.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 mt-4">Click Calculate Preview to compute availability.</div>
                  )}
                </div>

                <div className="space-y-2 pt-4 border-t border-slate-800">
                  <button
                    onClick={handleCalculatePreview}
                    disabled={isLoadingPreview}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded transition-colors flex items-center justify-center gap-1"
                  >
                    {isLoadingPreview ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Recalculate Selection
                  </button>

                  <button
                    onClick={() => setActiveStep('generate')}
                    disabled={!previewData}
                    className="w-full py-2.5 bg-[#1E40AF] hover:bg-blue-800 text-white text-xs font-bold rounded transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    Proceed to Summary <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================ STEP 4 — GENERATION SUMMARY & AI JOB ============================ */}
        {activeStep === 'generate' && (
          <div className="space-y-5">
            {isGeneratingShortfall ? (
              <div className="bg-white border border-slate-200 rounded p-12 text-center space-y-4">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto" />
                <h2 className="text-base font-bold text-slate-900">Generating Targeted Shortfall Questions</h2>
                <p className="text-xs text-slate-600 max-w-md mx-auto">{shortfallJobMessage}</p>
                <div className="font-mono text-xs text-slate-500">Status: {shortfallJobStatus}</div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded p-6 space-y-5">
                <header className="border-b border-slate-200 pb-3">
                  <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Question Paper Configuration Summary</h2>
                </header>

                {previewData && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
                    <div className="p-3 bg-slate-50 border rounded">
                      <div className="text-slate-500 text-[10px]">Subject</div>
                      <div className="font-bold text-slate-900 mt-1">{subjects.find((s) => s.id === selectedSubjectId)?.name}</div>
                    </div>
                    <div className="p-3 bg-slate-50 border rounded">
                      <div className="text-slate-500 text-[10px]">Selected Topics</div>
                      <div className="font-bold text-slate-900 mt-1">{selectedTopicIds.length} topics</div>
                    </div>
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded">
                      <div className="text-emerald-700 text-[10px]">Source Verified Questions</div>
                      <div className="font-bold text-emerald-900 mt-1">{previewData.selectedExistingCount}</div>
                    </div>
                    <div className="p-3 bg-purple-50 border border-purple-200 rounded">
                      <div className="text-purple-700 text-[10px]">AI Shortfall Required</div>
                      <div className="font-bold text-purple-900 mt-1">{previewData.aiRequiredCount}</div>
                    </div>
                  </div>
                )}

                {previewData?.sourceMaterialWarning && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded text-red-800 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{previewData.sourceMaterialWarning}</span>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                  <button onClick={() => setActiveStep('configure')} className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded hover:bg-slate-50">
                    Back to Configuration
                  </button>
                  <button
                    onClick={handleStartShortfallJob}
                    disabled={previewData?.aiRequiredCount > 0 && !previewData?.hasSourceMaterial}
                    className="px-6 py-2 bg-[#1E40AF] hover:bg-blue-800 text-white text-xs font-bold rounded flex items-center gap-1 disabled:opacity-50"
                  >
                    {previewData?.aiRequiredCount > 0 ? `Generate ${previewData.aiRequiredCount} Missing Questions` : 'Assemble Question Paper'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================ STEP 5 — QUESTION PAPER REVIEW & FINALIZATION ============================ */}
        {activeStep === 'review' && (
          <div className="space-y-5">
            {finalizedExam ? (
              /* Post-Finalization Examination Draft View */
              <div className="bg-white border border-slate-200 rounded p-6 space-y-5">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                    <div>
                      <h2 className="text-sm font-bold text-emerald-900">Examination Draft Created!</h2>
                      <p className="text-xs text-emerald-700 mt-0.5">
                        Status: <span className="font-mono font-bold">DRAFT</span> (isPublished = false). Explicit publishing required.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsPreviewModalOpen(true)}
                      className="px-4 py-2 bg-[#1E40AF] hover:bg-blue-800 text-white text-xs font-bold rounded flex items-center gap-1.5 shadow-sm"
                    >
                      <Eye className="w-4 h-4" />
                      Exam Preview &amp; Validate
                    </button>
                    <button
                      onClick={() => setShowFinalizedQuestions((v) => !v)}
                      className="px-4 py-2 border border-emerald-300 text-emerald-800 text-xs font-bold rounded hover:bg-emerald-100 flex items-center gap-1"
                    >
                      <Eye className="w-4 h-4" />
                      {showFinalizedQuestions ? 'Hide List' : `View Questions (${paperQuestions.length})`}
                    </button>
                    <button
                      onClick={handlePublishExamination}
                      disabled={isPublishing}
                      className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded flex items-center gap-1 disabled:opacity-50"
                    >
                      {isPublishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                      Publish Examination
                    </button>
                  </div>
                </div>

                {/* Exam Settings Form */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Exam Name</label>
                    <input
                      type="text"
                      value={finalizedExam.title}
                      readOnly
                      className="w-full p-2 bg-slate-50 border rounded font-semibold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Target Department</label>
                    <input
                      type="text"
                      value={finalizedExam.targetDepartment}
                      readOnly
                      className="w-full p-2 bg-slate-50 border rounded text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Duration (Minutes)</label>
                    <input
                      type="number"
                      value={finalizedExam.durationMinutes}
                      readOnly
                      className="w-full p-2 bg-slate-50 border rounded font-mono text-slate-900"
                    />
                  </div>
                </div>

                {/* Read-only Question Paper Content */}
                {showFinalizedQuestions && (
                  <div className="border border-slate-200 rounded">
                    <header className="px-4 py-2.5 border-b border-slate-200 bg-slate-50">
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Question Paper Content ({paperQuestions.length} Questions)
                      </h3>
                    </header>
                    {paperQuestions.length === 0 ? (
                      <p className="text-xs text-slate-500 p-4">
                        This paper's question list isn't available in this browser session (e.g. after a page reload).
                        View the full assembled paper from the <b>Examinations</b> tab instead.
                      </p>
                    ) : (
                      <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-left sticky top-0">
                            <tr>
                              <th className="px-3 py-2 font-semibold">Question ID / Stem</th>
                              <th className="px-3 py-2 font-semibold">Topic</th>
                              <th className="px-3 py-2 font-semibold">Type</th>
                              <th className="px-3 py-2 font-semibold">Difficulty</th>
                              <th className="px-3 py-2 font-semibold">Answer</th>
                              <th className="px-3 py-2 font-semibold">Source Ref</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {paperQuestions.map((q) => (
                              <tr key={q.id}>
                                <td className="px-3 py-2.5 font-medium text-slate-900 max-w-xs truncate" title={q.text}>
                                  {q.customId && <span className="font-mono text-blue-700 font-bold mr-1">[{q.customId}]</span>}
                                  {q.text}
                                </td>
                                <td className="px-3 py-2.5 text-slate-600">{q.subtopic?.topic?.name || q.sourceHeading || '—'}</td>
                                <td className="px-3 py-2.5 font-mono text-slate-700">{q.type}</td>
                                <td className="px-3 py-2.5 font-mono text-slate-700">{q.difficulty}</td>
                                <td className="px-3 py-2.5 font-mono font-bold text-emerald-700">
                                  {q.rawAnswer || JSON.stringify(q.correctAnswer)}
                                </td>
                                <td className="px-3 py-2.5 text-slate-500 font-mono">
                                  {q.sourceDocument?.title || (q.sourceHeading ? `Heading: ${q.sourceHeading}` : '—')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Review Table & Finalize Action */
              <div className="bg-white border border-slate-200 rounded">
                <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Selected Question Paper Review ({paperQuestions.length} Questions)
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Only VERIFIED questions enter the paper. Version snapshots are frozen at draft finalization.
                    </p>
                  </div>

                  <button
                    onClick={handleFinalizePaper}
                    disabled={isFinalizing || paperQuestions.length === 0}
                    className="px-5 py-2 bg-[#1E40AF] hover:bg-blue-800 text-white text-xs font-bold rounded flex items-center gap-1 disabled:opacity-50"
                  >
                    {isFinalizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Approve &amp; Create Draft
                  </button>
                </header>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-left">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Question ID / Stem</th>
                        <th className="px-3 py-2 font-semibold">Topic</th>
                        <th className="px-3 py-2 font-semibold">Type</th>
                        <th className="px-3 py-2 font-semibold">Difficulty</th>
                        <th className="px-3 py-2 font-semibold">Origin &amp; Status</th>
                        <th className="px-3 py-2 font-semibold">Answer</th>
                        <th className="px-3 py-2 font-semibold">Source Ref</th>
                        <th className="px-3 py-2 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paperQuestions.map((q) => (
                        <tr key={q.id}>
                          <td className="px-3 py-2.5 font-medium text-slate-900 max-w-xs truncate" title={q.text}>
                            {q.customId && <span className="font-mono text-blue-700 font-bold mr-1">[{q.customId}]</span>}
                            {q.text}
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">{q.subtopic?.topic?.name || q.sourceHeading || '—'}</td>
                          <td className="px-3 py-2.5 font-mono text-slate-700">{q.type}</td>
                          <td className="px-3 py-2.5 font-mono text-slate-700">{q.difficulty}</td>
                          <td className="px-3 py-2.5">
                            <VerificationBadge status={q.verificationStatus} origin={q.origin} />
                          </td>
                          <td className="px-3 py-2.5 font-mono font-bold text-emerald-700">
                            {q.rawAnswer || JSON.stringify(q.correctAnswer)}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500 font-mono">
                            {q.sourceDocument?.title || (q.sourceHeading ? `Heading: ${q.sourceHeading}` : '—')}
                          </td>
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => handleDeleteQuestion(q.id)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              title="Remove from paper"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Full Examination Preview & Validation Modal */}
      <ExamPreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        mockTestId={finalizedExam?.id}
        initialMockTest={
          finalizedExam || {
            title: examSettings.title || 'AI Assembled Question Paper',
            targetDepartment: examSettings.targetDepartment || 'Computer Science and Engineering',
            durationMinutes: examSettings.durationMinutes || 180,
            totalMarks: examSettings.totalMarks || 100,
            isPublished: false,
            status: 'DRAFT',
          }
        }
        initialQuestions={paperQuestions}
        onPublished={() => {
          if (finalizedExam) {
            setFinalizedExam((prev: any) => ({ ...prev, isPublished: true, status: 'PUBLISHED' }));
          }
        }}
      />
    </div>
  );
};
