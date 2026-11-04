'use client';

import React, { useState, useEffect } from 'react';
import {
  Maximize2,
  AlertTriangle,
  Eye,
  EyeOff,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ZoomIn,
  ZoomOut,
  X,
  RotateCcw,
  FileText,
} from 'lucide-react';
import api from '@/lib/api';
import {
  GateQuestion,
  normalizeGateQuestion,
  compareNatAnswer,
} from '@/types/question';

export interface QuestionRendererProps {
  question: any;
  selectedAnswer?: any;
  onSelectAnswer?: (answer: any) => void;
  showCorrectAnswer?: boolean;
  onZoomImage?: (url: string, title?: string) => void;
  viewMode?: 'QUESTION_BANK' | 'EXAM_PREVIEW' | 'ADMIN_REVIEW' | 'STUDENT_EXAM' | 'SOLUTION_VIEW';
  showInternalMetadata?: boolean;
  className?: string;
  defaultExpanded?: boolean;
}

/**
 * Normalizes an image path/filename into a browser-accessible URL.
 * Prioritizes high-resolution 300 DPI PNGs produced by gate-extraction-v2.
 */
function cleanImagePath(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let clean = raw.trim().replace(/\\/g, '/');
  if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('data:')) {
    return clean;
  }

  // 1. Direct path to gate-extraction-v2 images
  if (clean.startsWith('/images/')) {
    return clean;
  }
  if (clean.startsWith('images/')) {
    return `/${clean}`;
  }
  if (clean.startsWith('/gate-extraction-v2/')) {
    return clean;
  }
  if (clean.startsWith('gate-extraction-v2/')) {
    return `/${clean}`;
  }

  // 2. Extracted question filename pattern: e.g. 1_1_5.png, v3_3_3_5.png, /uploads/diagrams/1_1_5.jpg
  // Always normalize prefix (v2_, v3_) and map to canonical 300 DPI high-resolution PNG in /images/
  const filename = clean.split('/').pop() || '';
  const normalizedFilename = filename.replace(/^(?:v\d+_|vol\d+_)/i, '');
  const match = normalizedFilename.match(/^(\d+_\d+_\d+)(?:_p\d+)?\.(?:png|jpe?g|webp)$/i);
  if (match) {
    const pngName = normalizedFilename.replace(/\.(jpe?g|webp)$/i, '.png');
    return `/images/${pngName}`;
  }

  // 3. Fallback for other uploads
  if (clean.startsWith('/uploads/') || clean.startsWith('uploads/')) {
    return clean.startsWith('/') ? clean : `/${clean}`;
  }

  // 4. Default relative png to /images/
  if (clean.endsWith('.png')) {
    return `/images/${clean}`;
  }

  return clean.startsWith('/') ? clean : `/${clean}`;
}

/**
 * Returns the primary image URL for a given question.
 */
export function getQuestionImageUrl(q: any): string | null {
  if (!q) return null;
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

  // 1. Direct questionImage object or string
  if (q.questionImage) {
    const src = typeof q.questionImage === 'string' ? q.questionImage : q.questionImage.src;
    if (typeof src === 'string' && src.trim()) {
      return cleanImagePath(src);
    }
  }

  // 2. Direct imageUrl property
  if (typeof q.imageUrl === 'string' && q.imageUrl.trim()) {
    return cleanImagePath(q.imageUrl);
  }

  // 3. Fallback to API endpoint for source-image
  const qId = q.questionId || q.customId || q.id;
  if (qId) {
    return `${baseUrl}/question-bank/questions/${qId}/source-image`;
  }

  // 4. Legacy aliases
  let raw: string | null = null;
  if (typeof q.question_image === 'string' && q.question_image.trim()) raw = q.question_image.trim();
  else if (typeof q.image === 'string' && q.image.trim()) raw = q.image.trim();
  else if (q.image && typeof q.image === 'object' && typeof q.image.url === 'string') raw = q.image.url.trim();

  if (!raw) return null;
  return cleanImagePath(raw);
}

/**
 * Returns all image URLs for a question (supporting multi-page PDF questions).
 */
export function getQuestionImageUrls(q: any): string[] {
  if (!q) return [];
  const urls: string[] = [];

  const addOne = (src: any) => {
    if (!src) return;
    const str = typeof src === 'string' ? src : src.src || src.url;
    if (typeof str === 'string' && str.trim()) {
      urls.push(cleanImagePath(str));
    }
  };

  if (Array.isArray(q.questionImages)) {
    q.questionImages.forEach(addOne);
  } else if (Array.isArray(q.questionImage)) {
    q.questionImage.forEach(addOne);
  } else if (Array.isArray(q.images)) {
    q.images.forEach(addOne);
  }

  if (urls.length === 0) {
    const single = getQuestionImageUrl(q);
    if (single) urls.push(single);
  }

  return urls;
}

export function doesImageRequireReview(q: any): boolean {
  if (!q) return false;
  const norm = normalizeGateQuestion(q);
  return norm.status === 'needs_review';
}

export function getFormattedCorrectAnswer(q: any): { text: string; isSet: boolean } {
  if (!q) return { text: 'Not Specified (Needs Review)', isSet: false };
  const norm = normalizeGateQuestion(q);
  const ca = norm.correctAnswer;
  const isNat = (norm.questionType || norm.type || q.questionType || q.type) === 'NAT';

  if (Array.isArray(ca) && ca.length > 0) {
    const formatted = ca
      .map((item) => (typeof item === 'number' && !isNat ? String.fromCharCode(65 + item) : String(item).trim()))
      .join(', ');
    return { text: formatted, isSet: true };
  }
  if (typeof ca === 'string' && ca.trim()) {
    return { text: ca.trim(), isSet: true };
  }
  if (typeof ca === 'number') {
    return {
      text: isNat || !Number.isInteger(ca) || ca < 0 || ca >= 5 ? String(ca) : String.fromCharCode(65 + ca),
      isSet: true,
    };
  }
  if (typeof ca === 'object' && ca !== null && Object.keys(ca).length > 0) {
    if (Array.isArray(ca.acceptedRanges) && ca.acceptedRanges.length > 0) {
      const parts = ca.acceptedRanges.map((r: any) => {
        const min = r.min ?? r.range?.from ?? r.range?.[0];
        const max = r.max ?? r.range?.to ?? r.range?.[1];
        if (min !== undefined && max !== undefined) {
          return min === max ? `${min}` : `${min} to ${max}`;
        }
        if (r.value !== undefined) return `${r.value}`;
        return JSON.stringify(r);
      });
      return { text: parts.join(' or '), isSet: true };
    }
    if (ca.range && ca.range.from !== undefined && ca.range.to !== undefined) {
      if (ca.range.from === ca.range.to) {
        return { text: `${ca.range.from}`, isSet: true };
      }
      return { text: `${ca.range.from} to ${ca.range.to}`, isSet: true };
    }
    if (ca.min !== undefined && ca.max !== undefined) {
      if (ca.min === ca.max) {
        return { text: `${ca.min}`, isSet: true };
      }
      return { text: `${ca.min} to ${ca.max}`, isSet: true };
    }
    if (ca.value !== undefined && ca.value !== null) {
      return { text: `${ca.value}`, isSet: true };
    }
    return { text: JSON.stringify(ca), isSet: true };
  }
  return { text: 'Not Specified (Needs Review)', isSet: false };
}

export const QuestionRenderer: React.FC<QuestionRendererProps> = ({
  question,
  selectedAnswer,
  onSelectAnswer,
  showCorrectAnswer = false,
  onZoomImage,
  viewMode = 'QUESTION_BANK',
  showInternalMetadata = false,
  className = '',
  defaultExpanded,
}) => {
  // 1. Canonical normalization into GateQuestion schema
  const qNorm: GateQuestion = normalizeGateQuestion(question);

  // 2. Expand/Collapse initial state:
  // In STUDENT_EXAM and SOLUTION_VIEW modes, default to expanded so examinees and review sessions display immediately.
  // Otherwise, verified questions default to expanded, needs_review questions default to collapsed.
  const isStudentExam = viewMode === 'STUDENT_EXAM';
  const isSolutionView = viewMode === 'SOLUTION_VIEW';
  const isStudentOrSolution = isStudentExam || isSolutionView;

  const initialExpanded =
    defaultExpanded !== undefined
      ? defaultExpanded
      : qNorm.display?.defaultExpanded !== undefined
      ? qNorm.display.defaultExpanded
      : isStudentOrSolution
      ? true
      : qNorm.status === 'verified';

  const [isExpanded, setIsExpanded] = useState<boolean>(initialExpanded);
  const [showOcrDrawer, setShowOcrDrawer] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoverSuccessMsg, setRecoverSuccessMsg] = useState<string | null>(null);
  const [recoverErrorMsg, setRecoverErrorMsg] = useState<string | null>(null);
  const [cacheBuster, setCacheBuster] = useState(0);

  // Active image resolution and fallback tracking
  const rawImageUrls = getQuestionImageUrls(question);
  const [activeImageUrls, setActiveImageUrls] = useState<string[]>(rawImageUrls);

  // Built-in high-resolution zoom modal state
  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false);
  const [zoomedUrl, setZoomedUrl] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<'fit' | 100 | 150 | 200 | 300 | 400>('fit');
  const [naturalDims, setNaturalDims] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const ZOOM_LEVELS: Array<'fit' | 100 | 150 | 200 | 300 | 400> = ['fit', 100, 150, 200, 300, 400];

  const handleZoomIn = () => {
    const currentIndex = ZOOM_LEVELS.indexOf(zoomLevel);
    if (currentIndex < ZOOM_LEVELS.length - 1) {
      setZoomLevel(ZOOM_LEVELS[currentIndex + 1]);
    }
  };

  const handleZoomOut = () => {
    const currentIndex = ZOOM_LEVELS.indexOf(zoomLevel);
    if (currentIndex > 0) {
      setZoomLevel(ZOOM_LEVELS[currentIndex - 1]);
    }
  };

  const handleResetZoom = () => {
    setZoomLevel('fit');
  };

  useEffect(() => {
    if (!isZoomModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsZoomModalOpen(false);
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-' || e.key === '_') {
        handleZoomOut();
      } else if (e.key === '0') {
        handleResetZoom();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isZoomModalOpen, zoomLevel]);

  useEffect(() => {
    const nextNorm = normalizeGateQuestion(question);
    const nextExpanded =
      defaultExpanded !== undefined
        ? defaultExpanded
        : viewMode === 'STUDENT_EXAM'
        ? true
        : nextNorm.display?.defaultExpanded !== undefined
        ? nextNorm.display.defaultExpanded
        : nextNorm.status === 'verified';

    setIsExpanded(nextExpanded);
    setImageError(false);
    setRecoverErrorMsg(null);
    setRecoverSuccessMsg(null);
    setIsRecovering(false);
    setActiveImageUrls(getQuestionImageUrls(question));
  }, [question?.id, question?.customId, question?.questionId, defaultExpanded, viewMode]);

  if (!question) {
    return (
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 text-sm italic">
        No question data provided.
      </div>
    );
  }

  const rawText = typeof question.text === 'string' ? question.text.replace(/!\[.*?\]\((.*?)\)/g, '').trim() : '';

  const handleImageLoadError = (url: string, index: number) => {
    console.warn(`Question image failed to load: ${url}`);
    const qId = question.customId || qNorm.customId || qNorm.questionId || question.id;

    // 1. If /images/ failed, try static /uploads/diagrams/ fallback
    if (url.startsWith('/images/')) {
      const filename = url.split('/').pop()?.split('?')[0];
      if (filename) {
        const staticFallback = `/uploads/diagrams/${filename}`;
        setActiveImageUrls((prev) => {
          const next = [...prev];
          next[index] = staticFallback;
          return next;
        });
        return;
      }
    }

    // 2. Try public backend source-image endpoint (accessible to student sessions)
    if (qId && !url.includes('/source-image')) {
      const apiFallback = `/api/questions/${qId}/source-image`;
      setActiveImageUrls((prev) => {
        const next = [...prev];
        next[index] = apiFallback;
        return next;
      });
      return;
    }
    setImageError(true);
  };

  const handleRecoverImage = async () => {
    if (isRecovering) return;
    try {
      setIsRecovering(true);
      setRecoverErrorMsg(null);
      setRecoverSuccessMsg(null);
      const qId = qNorm.questionId || question.id || question.customId;
      if (!qId) return;

      const res = await api.post(`/admin/questions/${qId}/image/recover`);
      const data = res.data;
      if (data.success || data.recovered) {
        const targetUrl = data.imageUrl || `/api/question-bank/questions/${qId}/source-image`;
        const testImg = new Image();
        const buster = Date.now();
        testImg.onload = () => {
          setImageError(false);
          setCacheBuster(buster);
          setActiveImageUrls([`${targetUrl}?t=${buster}`]);
          setRecoverSuccessMsg('Source image recovered successfully');
          setIsRecovering(false);
        };
        testImg.onerror = () => {
          setRecoverErrorMsg('Source PDF page image could not be loaded into browser.');
          setIsRecovering(false);
        };
        testImg.src = `${targetUrl}?t=${buster}`;
      } else {
        setRecoverErrorMsg(data.message || 'Source PDF could not be found. Please re-import the source document.');
        setIsRecovering(false);
      }
    } catch (e: any) {
      console.warn('Image recovery failed:', e);
      const backendMsg = e?.response?.data?.message;
      setRecoverErrorMsg(backendMsg || 'Failed to connect to backend recovery service.');
      setIsRecovering(false);
    }
  };

  const qType = (qNorm.questionType || qNorm.type || question.questionType || question.type || 'MCQ').toUpperCase();
  const isNAT = qType === 'NAT';
  const isMSQ = qType === 'MSQ';
  const isMCQ = qType === 'MCQ';
  const isFreeResponse = qType === 'FREE_RESPONSE';

  // Extract initial NAT value from selectedAnswer or qNorm.studentAnswer
  const getInitialNat = (): string => {
    const parseVal = (val: any): string => {
      if (val === undefined || val === null) return '';
      if (typeof val === 'object' && val !== null && 'value' in val) {
        return String(val.value);
      }
      if (typeof val === 'string') {
        if (val === '[object Object]') return '';
        return val;
      }
      if (typeof val === 'number') {
        return String(val);
      }
      return '';
    };

    const fromSelected = parseVal(selectedAnswer);
    if (fromSelected) return fromSelected;
    const fromStudent = parseVal(qNorm.studentAnswer);
    if (fromStudent) return fromStudent;
    return '';
  };

  const [natInputValue, setNatInputValue] = useState<string>(getInitialNat);
  const [natValidationError, setNatValidationError] = useState<string | null>(null);
  const [natSubmittedAnswer, setNatSubmittedAnswer] = useState<string | null>(() => {
    const init = getInitialNat();
    return init !== '' ? init : null;
  });

  useEffect(() => {
    const current = getInitialNat();
    setNatInputValue(current);
    setNatSubmittedAnswer(current !== '' ? current : null);
  }, [selectedAnswer, qNorm.studentAnswer]);

  const handleNatSubmit = () => {
    const trimmed = natInputValue.trim();
    if (!trimmed) {
      setNatValidationError('Please enter a numerical answer.');
      return;
    }
    const isNumeric = /^-?\d+(?:\.\d+)?$/.test(trimmed);
    if (!isNumeric) {
      setNatValidationError('Please enter a valid numerical value (e.g. 12.5 or -5).');
      return;
    }
    const numVal = parseFloat(trimmed);
    if (isNaN(numVal)) {
      setNatValidationError('Please enter a valid numerical value.');
      return;
    }
    setNatValidationError(null);
    setNatSubmittedAnswer(trimmed);
    onSelectAnswer?.(trimmed);
  };

  // Option keys: Default to ['A', 'B', 'C', 'D'].
  // If options array has 5 or more keys (e.g. A-E), preserve them.
  const optionKeys: string[] =
    Array.isArray(qNorm.options) && qNorm.options.length > 4
      ? qNorm.options.map((opt, i) =>
          typeof opt === 'object' && opt?.key ? String(opt.key).toUpperCase() : String.fromCharCode(65 + i)
        )
      : ['A', 'B', 'C', 'D'];

  // Helper to check if an option is selected (supports keys 'A', 'B', etc. and 0-based indices)
  const isOptionSelected = (key: string, optIdx: number): boolean => {
    if (selectedAnswer === undefined || selectedAnswer === null) return false;
    if (Array.isArray(selectedAnswer)) {
      return (
        selectedAnswer.includes(key) ||
        selectedAnswer.includes(key.toUpperCase()) ||
        selectedAnswer.includes(optIdx) ||
        selectedAnswer.includes(String(optIdx))
      );
    }
    if (typeof selectedAnswer === 'string') {
      const cleanSel = selectedAnswer.trim().toUpperCase();
      return cleanSel === key.toUpperCase() || cleanSel === String(optIdx);
    }
    if (typeof selectedAnswer === 'number') {
      return selectedAnswer === optIdx;
    }
    return false;
  };

  // Helper to check if an option is correct
  const isOptionCorrect = (key: string, optIdx: number): boolean => {
    let ca = qNorm.correctAnswer;
    if (ca === undefined || ca === null) return false;
    if (typeof ca === 'object' && !Array.isArray(ca) && 'value' in ca) {
      ca = ca.value;
    }

    if (Array.isArray(ca)) {
      return (
        ca.includes(key) ||
        ca.includes(key.toUpperCase()) ||
        ca.includes(optIdx) ||
        ca.includes(String.fromCharCode(65 + optIdx)) ||
        ca.includes(String(optIdx))
      );
    }
    if (typeof ca === 'string') {
      const cleanCa = ca.trim().toUpperCase();
      return cleanCa === key.toUpperCase() || cleanCa === String.fromCharCode(65 + optIdx) || cleanCa === String(optIdx);
    }
    if (typeof ca === 'number') {
      return ca === optIdx;
    }
    return false;
  };

  // Handle option click (Only records student answer; does NOT reveal correctness)
  const handleOptionClick = (key: string, optIdx: number) => {
    if (!onSelectAnswer || viewMode === 'SOLUTION_VIEW') return;

    if (isMSQ) {
      const currentSelected = Array.isArray(selectedAnswer) ? [...selectedAnswer] : [];
      const indexInSel =
        currentSelected.indexOf(optIdx) >= 0
          ? currentSelected.indexOf(optIdx)
          : currentSelected.indexOf(key);
      if (indexInSel >= 0) {
        currentSelected.splice(indexInSel, 1);
      } else {
        currentSelected.push(optIdx);
      }
      onSelectAnswer(currentSelected);
    } else {
      // MCQ single select
      onSelectAnswer([optIdx]);
    }
  };

  const handleOpenZoom = (targetUrl?: string) => {
    const url = targetUrl || activeImageUrls[0];
    if (!url) return;
    if (onZoomImage) {
      onZoomImage(url, `Question ${qNorm.questionId}`);
    } else {
      setZoomedUrl(url);
      setZoomLevel('fit');
      setIsZoomModalOpen(true);
    }
  };

  const handleOpenFullPdfPage = async () => {
    try {
      const docId = qNorm.source?.pdf || question.sourceDocumentId || question.sourceDocument?.id || '2014_CS.pdf';
      const pageNum = qNorm.source?.page || question.sourcePage || 29;
      const res = await api.get(`/ai/documents/${docId}/download`, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(`${blobUrl}#page=${pageNum}`, '_blank');
    } catch (e: any) {
      console.warn('Failed to open PDF document:', e);
      window.open(`/api/question-bank/questions/${qNorm.questionId}/source-image`, '_blank');
    }
  };

  // =========================================================================
  // 1. COLLAPSED QUESTION VIEW
  // For questions marked status="needs_review", render collapsed by default
  // in review workflows (can be expanded with a single click).
  // =========================================================================
  if (!isExpanded && !isStudentOrSolution) {
    return (
      <div className={`erp-card p-0 overflow-hidden border border-amber-300 bg-amber-50/40 rounded-lg shadow-xs hover:border-amber-400 transition-all ${className}`}>
        <div
          onClick={() => setIsExpanded(true)}
          className="p-3.5 flex items-center justify-between cursor-pointer select-none"
          title="Click to expand question view"
        >
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-slate-800 text-sm">
              {qNorm.questionId}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-200 text-amber-900 border border-amber-300 uppercase">
              NEEDS REVIEW
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
            <span>Expand</span>
            <ChevronDown className="w-4 h-4 text-amber-700" />
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 2. EXPANDED QUESTION VIEW
  // The original question image is the COMPLETE source of truth.
  // The student reads EVERYTHING from the original question image:
  // - Question text, Equations, Diagrams, Tables, Figures, All answer choices.
  // The A/B/C/D controls in the UI are ONLY answer-selection controls.
  // THEY MUST NEVER DISPLAY OPTION TEXT.
  // =========================================================================
  return (
    <div className={`space-y-5 bg-white p-5 border border-slate-200 rounded-xl shadow-xs ${className}`}>
      {/* Top Header Row with Question ID, Status Badge & Collapse Toggle (Hidden during student exams and solution review) */}
      {!isStudentOrSolution && (
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-lg text-[#1E40AF]">
              Question {question.order !== undefined ? question.order : qNorm.customId || qNorm.questionId}
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase border ${
                qNorm.status === 'verified'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-amber-50 text-amber-800 border-amber-300'
              }`}
            >
              {qNorm.status === 'verified' ? 'Verified' : 'Needs Review'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {qNorm.status === 'needs_review' && (
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 py-1 px-2.5 rounded-md hover:bg-slate-100 transition-colors"
                title="Collapse question view"
              >
                <span>Collapse</span>
                <ChevronUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Source Metadata Header Bar (Hidden during student exams and solution review) */}
      {!isStudentOrSolution && (qNorm.source?.pdf || qNorm.source?.page || (qNorm.source as any)?.pages) && (
        <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center gap-2 font-mono text-slate-600 w-fit">
          <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span className="font-semibold text-slate-700">Source:</span>
          <span>{qNorm.source?.pdf || 'filter1_volume3 (1)(1).pdf'}</span>
          <span className="text-slate-300">•</span>
          <span className="font-semibold text-slate-700">Page:</span>
          <span>
            {Array.isArray((qNorm.source as any)?.pages)
              ? (qNorm.source as any).pages.join(', ')
              : Array.isArray(qNorm.source?.page)
              ? (qNorm.source?.page as any[]).join(', ')
              : qNorm.source?.page || '29'}
          </span>
        </div>
      )}

      {/* Needs Review Banner if Status is needs_review */}
      {qNorm.status === 'needs_review' && !isStudentOrSolution && (
        <div className="p-3 bg-amber-50 border border-amber-300 rounded-md text-amber-900 text-xs flex items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-semibold">
              {qNorm.reviewReasonMessage ||
                (qNorm.reviewReason === 'ANSWER_MISSING' || !qNorm.correctAnswer || qNorm.correctAnswer === 'needs_review'
                  ? 'Needs review: answer key is missing.'
                  : !qNorm.questionImage
                  ? 'Needs review: question image is missing.'
                  : 'Needs review: question image or boundaries require verification.')}
            </span>
          </div>
          <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded font-mono text-[10px] font-bold uppercase shrink-0">
            Needs Review
          </span>
        </div>
      )}

      {/* Recovery Success Banner */}
      {recoverSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-md text-emerald-900 text-xs flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{recoverSuccessMsg}</span>
        </div>
      )}

      {/* =========================================================================
          3. LARGE ORIGINAL QUESTION IMAGE — COMPLETE SOURCE OF TRUTH
          Contains stem, equations, diagrams, tables, figures, original choices A/B/C/D.
          Preserves aspect ratio, full resolution, readable, zoomable.
          Supports questions spanning multiple PDF pages.
          ========================================================================= */}
      {activeImageUrls.length > 0 && !imageError ? (
        <div className="space-y-4">
          {activeImageUrls.map((url, imgIdx) => {
            const finalUrl = cacheBuster ? `${url}?t=${cacheBuster}` : url;
            return (
              <div
                key={imgIdx}
                className="relative group w-full bg-white p-3 border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col items-center"
              >
                {activeImageUrls.length > 1 && (
                  <div className="w-full text-left font-mono text-xs text-slate-500 font-semibold mb-2">
                    Source Page / Section {imgIdx + 1}
                  </div>
                )}
                <div className="w-full flex justify-center overflow-hidden">
                  <img
                    src={finalUrl}
                    alt={`Question ${qNorm.questionId} Complete Question Image`}
                    style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
                    className="w-full max-w-4xl rounded-lg cursor-zoom-in transition-all"
                    onError={() => handleImageLoadError(url, imgIdx)}
                    onClick={() => handleOpenZoom(finalUrl)}
                  />
                </div>

                {/* Prominent Zoom Button */}
                <div className="absolute top-4 right-4 flex items-center gap-2 opacity-90 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => handleOpenZoom(finalUrl)}
                    className="px-3 py-1.5 bg-slate-900/85 hover:bg-slate-900 text-white rounded-md text-xs font-medium flex items-center gap-1.5 shadow transition-colors"
                    title="Click to Zoom Image"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Zoom Image</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : imageError ? (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs font-mono space-y-2 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="font-bold flex items-center gap-1.5 font-sans">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                {isStudentOrSolution
                  ? 'Question image could not be loaded. Please proceed to other questions.'
                  : `Source document temporarily unavailable for Question ${question.order !== undefined ? question.order : qNorm.customId || qNorm.questionId}`}
              </span>
            </div>
            {!isStudentOrSolution && (
              <button
                type="button"
                disabled={isRecovering}
                onClick={handleRecoverImage}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-sans text-xs font-bold transition-colors shrink-0 shadow-sm disabled:opacity-50"
              >
                {isRecovering ? 'Recovering...' : 'Recover Source Image'}
              </button>
            )}
          </div>
          {!isStudentOrSolution && recoverErrorMsg && (
            <p className="text-xs font-sans text-rose-700 font-semibold bg-rose-50 p-2 rounded border border-rose-200">
              {recoverErrorMsg}
            </p>
          )}
        </div>
      ) : (
        /* Text Fallback: only if no question image exists */
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm leading-relaxed font-medium">
          {rawText || <span className="text-slate-400 italic">No question image or text available.</span>}
        </div>
      )}

      {/* =========================================================================
          4. ANSWER-SELECTION CONTROLS (ONLY A, B, C, D — NEVER OPTION TEXT)
          ========================================================================= */}
      <div className="space-y-4 pt-1">
        {isNAT ? (
          <div className="space-y-3 pt-2 max-w-md">
            <label htmlFor={`nat-input-${qNorm.questionId}`} className="block text-sm font-semibold text-slate-800">
              Your Answer:
            </label>
            <div className="flex items-center gap-2">
              <input
                id={`nat-input-${qNorm.questionId}`}
                type="text"
                disabled={viewMode === 'SOLUTION_VIEW'}
                value={natInputValue}
                onChange={(e) => {
                  setNatInputValue(e.target.value);
                  if (natValidationError) setNatValidationError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleNatSubmit();
                  }
                }}
                placeholder="Enter numerical value"
                className="flex-1 px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-base focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              />
              {viewMode !== 'SOLUTION_VIEW' && (
                <button
                  id={`nat-submit-${qNorm.questionId}`}
                  type="button"
                  onClick={handleNatSubmit}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer shadow-xs whitespace-nowrap"
                >
                  Submit Answer
                </button>
              )}
            </div>

            {natValidationError && (
              <div id={`nat-error-${qNorm.questionId}`} className="text-xs text-rose-600 font-medium flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{natValidationError}</span>
              </div>
            )}

            {/* In normal exam mode: show student's submitted answer once entered */}
            {natSubmittedAnswer !== null && viewMode !== 'SOLUTION_VIEW' && !showCorrectAnswer && (
              <div id={`nat-student-answer-${qNorm.questionId}`} className="text-sm text-slate-700 font-medium pt-1">
                Your Answer: <span className="font-mono font-bold text-blue-700">{natSubmittedAnswer}</span>
              </div>
            )}

            {/* In review/solution mode, show correct answer & comparison */}
            {(showCorrectAnswer || viewMode === 'SOLUTION_VIEW' || viewMode === 'ADMIN_REVIEW') && (
              <div className="mt-4 p-3.5 bg-emerald-50/90 border border-emerald-200 rounded-xl text-xs font-mono flex flex-wrap items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-sans font-bold text-emerald-900">Correct Answer:</span>
                  <span className="px-2.5 py-0.5 bg-emerald-200 text-emerald-950 font-bold rounded text-sm">
                    {getFormattedCorrectAnswer(qNorm).text}
                  </span>
                </div>

                {natSubmittedAnswer !== null && (
                  <div className="flex items-center gap-2 text-slate-700 font-sans">
                    <span className="font-semibold text-slate-500">Your Answer:</span>
                    <span className="font-mono font-bold px-2 py-0.5 rounded text-xs bg-slate-100 border border-slate-200 text-slate-800">
                      {natSubmittedAnswer}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        compareNatAnswer(natSubmittedAnswer, qNorm.correctAnswer)
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {compareNatAnswer(natSubmittedAnswer, qNorm.correctAnswer) ? 'Correct' : 'Incorrect'}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : isFreeResponse ? (
          <div className="max-w-xl space-y-2 bg-slate-50 p-4 border border-slate-200 rounded-lg">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Free Response Answer:
            </label>
            <textarea
              rows={4}
              disabled={viewMode === 'SOLUTION_VIEW'}
              value={selectedAnswer !== undefined && selectedAnswer !== null ? selectedAnswer : ''}
              onChange={(e) => onSelectAnswer?.(e.target.value)}
              placeholder="Type your response here..."
              className="erp-input font-sans text-slate-800 bg-white w-full"
            />
          </div>
        ) : (
          /* MCQ / MSQ: Render ONLY [ A ] [ B ] [ C ] [ D ] controls.
             Buttons contain ONLY A, B, C, D. No additional text.
             Selecting an answer records/highlights student answer.
             Does NOT reveal the correct answer during student solving sessions. */
          <div className="py-2">
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 py-4">
              {optionKeys.map((key, optIdx) => {
                const selected = isOptionSelected(key, optIdx);
                const correct = isOptionCorrect(key, optIdx);

                let buttonClasses = '';

                if (showCorrectAnswer || viewMode === 'SOLUTION_VIEW') {
                  // Review / Solution Mode: reveal correct answer and candidate response
                  if (correct && selected) {
                    buttonClasses =
                      'bg-emerald-600 border-2 border-emerald-600 text-white shadow-md ring-4 ring-emerald-100 scale-105';
                  } else if (correct) {
                    buttonClasses =
                      'bg-emerald-50 border-2 border-emerald-500 text-emerald-800 ring-2 ring-emerald-200 font-extrabold';
                  } else if (selected) {
                    buttonClasses =
                      'bg-rose-600 border-2 border-rose-600 text-white shadow-md ring-4 ring-rose-100 scale-105';
                  } else {
                    buttonClasses = 'bg-slate-50 border-2 border-slate-200 text-slate-400';
                  }
                } else if (selected) {
                  // Normal Student Solving Mode: Selected state (records student choice, does NOT reveal correctness)
                  buttonClasses =
                    'bg-[#1E40AF] border-2 border-[#1E40AF] text-white shadow-md ring-4 ring-blue-100 scale-105 font-extrabold';
                } else {
                  // Normal Student Solving Mode: Unselected state
                  buttonClasses =
                    'bg-white border-2 border-slate-300 text-slate-800 hover:border-[#1E40AF] hover:text-[#1E40AF] hover:bg-blue-50/60 shadow-xs';
                }

                return (
                  <button
                    key={key}
                    type="button"
                    id={`answer-btn-${qNorm.questionId}-${key}`}
                    disabled={viewMode === 'SOLUTION_VIEW'}
                    onClick={() => handleOptionClick(key, optIdx)}
                    className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl flex items-center justify-center font-mono font-bold text-xl sm:text-2xl transition-all duration-150 select-none cursor-pointer ${buttonClasses}`}
                    title={`Option ${key}`}
                  >
                    {key}
                  </button>
                );
              })}
            </div>

            {/* =========================================================================
                5. CORRECT ANSWER DISPLAY (ONLY REVEALED IN REVIEW / SOLUTION MODE)
                Hidden completely during student exam / solving session.
                ========================================================================= */}
            {(showCorrectAnswer || viewMode === 'SOLUTION_VIEW' || viewMode === 'ADMIN_REVIEW') && (
              <div className="mt-4 p-3.5 bg-emerald-50/90 border border-emerald-200 rounded-xl text-xs font-mono flex flex-wrap items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-sans font-bold text-emerald-900">Official Correct Answer:</span>
                  <span className="px-2.5 py-0.5 bg-emerald-200 text-emerald-950 font-bold rounded text-sm">
                    {getFormattedCorrectAnswer(qNorm).text}
                  </span>
                </div>

                {selectedAnswer !== undefined && selectedAnswer !== null && (
                  <div className="flex items-center gap-2 text-slate-700 font-sans">
                    <span className="font-semibold text-slate-500">Student Response:</span>
                    <span className="font-mono font-bold px-2 py-0.5 rounded text-xs bg-slate-100 border border-slate-200 text-slate-800">
                      {Array.isArray(selectedAnswer)
                        ? selectedAnswer
                            .map((item) =>
                              typeof item === 'number'
                                ? String.fromCharCode(65 + item)
                                : String(item).toUpperCase()
                            )
                            .join(', ')
                        : typeof selectedAnswer === 'number'
                        ? String.fromCharCode(65 + selectedAnswer)
                        : String(selectedAnswer).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Internal Machine-Readable Drawer (Optional for dev/admin inspection) */}
      {(showInternalMetadata || viewMode === 'ADMIN_REVIEW' || viewMode === 'QUESTION_BANK') && (
        <div className="pt-3 border-t border-slate-100 text-xs">
          <button
            type="button"
            onClick={() => setShowOcrDrawer((p) => !p)}
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 font-mono text-[11px] font-medium transition-colors"
          >
            {showOcrDrawer ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>Internal OCR & Metadata Layer ({showOcrDrawer ? 'Hide' : 'Show'})</span>
          </button>
          {showOcrDrawer && (
            <div className="mt-2 p-3 bg-slate-900 text-slate-200 rounded-md font-mono text-xs space-y-2">
              <div>
                <span className="text-blue-400 font-bold">Internal OCR Search Text:</span>
                <p className="mt-1 whitespace-pre-wrap text-slate-300">{rawText || '—'}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                <div>Question ID: {qNorm.questionId}</div>
                <div>Status: {qNorm.status}</div>
                <div>Image Sources: {activeImageUrls.join(', ') || 'None'}</div>
                <div>Correct Answer: {JSON.stringify(qNorm.correctAnswer)}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Built-in Full-Resolution Image Zoom Modal */}
      {isZoomModalOpen && zoomedUrl && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
          onClick={() => setIsZoomModalOpen(false)}
        >
          <div
            className="relative bg-slate-900 rounded-2xl shadow-2xl max-w-6xl max-h-[92vh] w-full flex flex-col overflow-hidden border border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex flex-wrap items-center justify-between px-5 py-3.5 bg-slate-900 text-white border-b border-slate-800 gap-3">
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-sm text-blue-400">
                  Question {qNorm.questionId}
                </span>
                <span className="text-xs text-slate-400 hidden sm:inline">
                  Original 300 DPI High-Resolution Image
                </span>
                {naturalDims.width > 0 && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                    {naturalDims.width} × {naturalDims.height} px
                  </span>
                )}
              </div>

              {/* Zoom Controls Bar */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Discrete Zoom Level Selector */}
                <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                  {ZOOM_LEVELS.map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setZoomLevel(lvl)}
                      className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                        zoomLevel === lvl
                          ? 'bg-blue-600 text-white font-bold shadow-xs'
                          : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                      }`}
                      title={lvl === 'fit' ? 'Fit to Viewport' : `Zoom to ${lvl}%`}
                    >
                      {lvl === 'fit' ? 'Fit' : `${lvl}%`}
                    </button>
                  ))}
                </div>

                <div className="h-5 w-px bg-slate-700 mx-1 hidden sm:block" />

                <button
                  type="button"
                  disabled={zoomLevel === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
                  onClick={handleZoomIn}
                  className="p-1.5 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent rounded text-slate-300 hover:text-white transition-colors"
                  title="Zoom In (+)"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={zoomLevel === 'fit'}
                  onClick={handleZoomOut}
                  className="p-1.5 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent rounded text-slate-300 hover:text-white transition-colors"
                  title="Zoom Out (-)"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleResetZoom}
                  className="p-1.5 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition-colors"
                  title="Reset to Fit (0)"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsZoomModalOpen(false)}
                  className="p-1.5 hover:bg-rose-900/40 rounded text-slate-300 hover:text-rose-400 ml-1 sm:ml-2 transition-colors"
                  title="Close (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body with Pan/Scroll viewport */}
            <div className="flex-1 overflow-auto p-4 sm:p-8 bg-slate-950 flex items-center justify-center min-h-[420px] max-h-[78vh]">
              <div className="inline-block m-auto transition-all duration-150">
                <img
                  src={zoomedUrl}
                  alt={`Question ${qNorm.questionId} Full Resolution Image`}
                  style={
                    zoomLevel === 'fit'
                      ? {
                          maxWidth: '100%',
                          maxHeight: '72vh',
                          width: 'auto',
                          height: 'auto',
                          objectFit: 'contain',
                          display: 'block',
                        }
                      : {
                          width: `${Math.round((naturalDims.width || 2168) * (zoomLevel / 100))}px`,
                          maxWidth: 'none',
                          height: 'auto',
                          display: 'block',
                          imageRendering: 'auto',
                        }
                  }
                  className="rounded shadow-2xl bg-white select-none"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (img.naturalWidth && img.naturalHeight) {
                      setNaturalDims({ width: img.naturalWidth, height: img.naturalHeight });
                    }
                  }}
                />
              </div>
            </div>

            {/* Modal Footer status bar */}
            <div className="px-5 py-2 bg-slate-900 border-t border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-between">
              <span>Current Scale: {zoomLevel === 'fit' ? 'Fit Viewport' : `${zoomLevel}%`}</span>
              <span className="text-slate-500">Press Esc to close • Scroll to inspect details</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
