'use client';

import React, { useState } from 'react';
import { Maximize2, AlertTriangle, Eye, EyeOff, CheckCircle2, XCircle, HelpCircle, FileText } from 'lucide-react';
import api from '@/lib/api';
import { QuestionOptionContent, getOptionText, getOptionImage } from './QuestionOptionContent';

export interface QuestionRendererProps {
  question: any;
  selectedAnswer?: any;
  onSelectAnswer?: (answer: any) => void;
  showCorrectAnswer?: boolean;
  onZoomImage?: (url: string, title?: string) => void;
  viewMode?: 'QUESTION_BANK' | 'EXAM_PREVIEW' | 'ADMIN_REVIEW' | 'STUDENT_EXAM' | 'SOLUTION_VIEW';
  showInternalMetadata?: boolean;
  className?: string;
}

export function getQuestionImageUrl(q: any): string | null {
  if (!q) return null;
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

  if (typeof q.imageUrl === 'string' && q.imageUrl.trim()) {
    const trimmed = q.imageUrl.trim();
    if (trimmed.startsWith('/uploads/') || trimmed.startsWith('uploads/')) {
      return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    }
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
      return trimmed;
    }
  }

  const qId = q.customId || q.id;
  if (qId) {
    return `${baseUrl}/question-bank/questions/${qId}/source-image`;
  }

  let raw: string | null = null;
  if (typeof q.question_image === 'string' && q.question_image.trim()) raw = q.question_image.trim();
  else if (typeof q.questionImage === 'string' && q.questionImage.trim()) raw = q.questionImage.trim();
  else if (typeof q.image === 'string' && q.image.trim()) raw = q.image.trim();
  else if (q.image && typeof q.image === 'object' && typeof q.image.url === 'string' && q.image.url.trim()) raw = q.image.url.trim();

  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) {
    return raw;
  }
  let clean = raw.replace(/\\/g, '/');
  if (clean.startsWith('/uploads/')) return clean;
  if (clean.startsWith('uploads/')) return `/${clean}`;
  return `/uploads/diagrams/${clean.split('/').pop() || clean}`;
}

export function getOptionCropYPercent(q: any): number | null {
  if (!q) return null;
  const vm = q.visualMetadata || q.cropCoordinates || q.cropBox || {};
  if (typeof vm.cropYPercent === 'number') return vm.cropYPercent;
  if (typeof vm.optionBoundaryY === 'number') {
    return vm.optionBoundaryY <= 1 ? vm.optionBoundaryY * 100 : vm.optionBoundaryY;
  }
  if (typeof q.cropYPercent === 'number') return q.cropYPercent;
  if (typeof q.optionBoundaryY === 'number') {
    return q.optionBoundaryY <= 1 ? q.optionBoundaryY * 100 : q.optionBoundaryY;
  }
  return null;
}

export function doesImageRequireReview(q: any): boolean {
  if (!q) return false;
  if (q.verificationStatus === 'NEEDS_REVIEW' || q.reviewStatus === 'NEEDS_REVIEW' || q.needsReview) {
    return true;
  }
  const containsEmbeddedOptions = !!(q.imageIncludesOptions || q.containsEmbeddedOptions || q.source_includes_options || q.hasEmbeddedOptions);
  const hasStructuredOptions = Array.isArray(q.options) && q.options.length > 0;
  const hasBoundaryCrop = getOptionCropYPercent(q) !== null;

  if (containsEmbeddedOptions && hasStructuredOptions && !hasBoundaryCrop) {
    return true;
  }
  return false;
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
}) => {
  const [showOcrDrawer, setShowOcrDrawer] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoverSuccessMsg, setRecoverSuccessMsg] = useState<string | null>(null);
  const [recoverErrorMsg, setRecoverErrorMsg] = useState<string | null>(null);
  const [cacheBuster, setCacheBuster] = useState(0);

  if (!question) {
    return (
      <div className="p-4 bg-slate-50 border border-slate-200 rounded text-slate-500 text-sm italic">
        No question data provided.
      </div>
    );
  }

  const rawImageUrl = getQuestionImageUrl(question);
  const imageUrl = rawImageUrl ? (cacheBuster ? `${rawImageUrl}?t=${cacheBuster}` : rawImageUrl) : null;
  const cropYPercent = getOptionCropYPercent(question);
  const requiresReview = doesImageRequireReview(question);
  const rawText = typeof question.text === 'string' ? question.text.replace(/!\[.*?\]\((.*?)\)/g, '').trim() : '';

  const handleRecoverImage = async () => {
    if (isRecovering) return;
    try {
      setIsRecovering(true);
      setRecoverErrorMsg(null);
      setRecoverSuccessMsg(null);
      const qId = question.id || question.customId;
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
      const status = e?.response?.status;
      if (status === 404) {
        setRecoverErrorMsg(backendMsg || 'Source PDF could not be found. Please re-import the source document.');
      } else if (status === 401 || status === 403) {
        setRecoverErrorMsg('Authentication or permission required to recover source images.');
      } else if (backendMsg) {
        setRecoverErrorMsg(backendMsg);
      } else {
        setRecoverErrorMsg('Failed to connect to backend recovery service.');
      }
      setIsRecovering(false);
    }
  };

  const qType = (question.type || 'MCQ').toUpperCase();
  const isNAT = qType === 'NAT';
  const isFreeResponse = qType === 'FREE_RESPONSE';
  const isMatch = qType === 'MATCH_THE_FOLLOWING';
  const isMCQorMSQ = qType === 'MCQ' || qType === 'MSQ';

  const optionsList: any[] = Array.isArray(question.options) ? question.options : [];

  // Helper to check if an option index is selected
  const isOptionSelected = (optIdx: number): boolean => {
    if (selectedAnswer === undefined || selectedAnswer === null) return false;
    if (Array.isArray(selectedAnswer)) {
      return selectedAnswer.includes(optIdx);
    }
    if (typeof selectedAnswer === 'number') {
      return selectedAnswer === optIdx;
    }
    if (typeof selectedAnswer === 'string') {
      const parsed = parseInt(selectedAnswer, 10);
      return !isNaN(parsed) && parsed === optIdx;
    }
    return false;
  };

  // Helper to check if an option index is correct
  const isOptionCorrect = (optIdx: number): boolean => {
    const ca = question.correctAnswer;
    if (ca === undefined || ca === null) return false;
    if (Array.isArray(ca)) {
      return ca.includes(optIdx) || ca.includes(String.fromCharCode(65 + optIdx)) || ca.includes(String(optIdx));
    }
    if (typeof ca === 'number') return ca === optIdx;
    if (typeof ca === 'string') {
      if (ca.trim().toUpperCase() === String.fromCharCode(65 + optIdx)) return true;
      if (ca.trim() === String(optIdx)) return true;
    }
    return false;
  };

  const handleOptionClick = (optIdx: number) => {
    if (!onSelectAnswer || viewMode === 'SOLUTION_VIEW') return;

    if (qType === 'MCQ') {
      onSelectAnswer([optIdx]);
    } else if (qType === 'MSQ') {
      const currentSelected = Array.isArray(selectedAnswer) ? [...selectedAnswer] : [];
      const indexInSel = currentSelected.indexOf(optIdx);
      if (indexInSel >= 0) {
        currentSelected.splice(indexInSel, 1);
      } else {
        currentSelected.push(optIdx);
      }
      onSelectAnswer(currentSelected);
    }
  };

  const handleOpenFullPdfPage = async () => {
    try {
      const docId = question.sourceDocumentId || question.sourceDocument?.id || 'import_1788025494809';
      const pageNum = question.sourcePage || 447;
      const res = await api.get(`/ai/documents/${docId}/download`, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(`${blobUrl}#page=${pageNum}`, '_blank');
    } catch (e: any) {
      console.warn('Failed to open PDF document:', e);
      window.open(`/api/question-bank/questions/${question.customId || question.id}/source-image`, '_blank');
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Source Metadata Header Bar */}
      {(question.sourceDocumentId || question.sourceDocument || question.sourcePage) && (
        <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-md text-xs flex flex-wrap items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2 font-mono text-slate-700">
            <FileText className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="font-bold">Source:</span>
            <span>{question.sourceDocument?.fileName || question.sourceDocument?.title || question.sourceDocumentId || '2014_CS.pdf'}</span>
            <span className="text-slate-400">•</span>
            <span className="font-bold">Page:</span>
            <span>{question.sourcePage || '447'}</span>
          </div>
          <button
            type="button"
            onClick={handleOpenFullPdfPage}
            className="px-2.5 py-1 bg-blue-700 hover:bg-blue-800 text-white rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors shadow-xs"
            title="Open original source PDF document at source page"
          >
            <Maximize2 className="w-3 h-3" />
            <span>Open Full Source Page</span>
          </button>
        </div>
      )}

      {/* Verification Status Warning / Banner if NEEDS_REVIEW */}
      {requiresReview && (
        <div className="p-3 bg-amber-50 border border-amber-300 rounded-md text-amber-900 text-xs flex items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4.5 h-4.5 text-amber-600 shrink-0" />
            <span className="font-semibold">
              NEEDS REVIEW: Question image boundary or option extraction requires manual review.
            </span>
          </div>
          <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded font-mono text-[10px] font-bold uppercase shrink-0">
            Needs Review
          </span>
        </div>
      )}

      {/* Recover Success Banner */}
      {recoverSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-md text-emerald-900 text-xs flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{recoverSuccessMsg}</span>
        </div>
      )}

      {/* 1. PRIMARY QUESTION DISPLAY: ORIGINAL PDF QUESTION IMAGE */}
      {imageUrl && !imageError ? (
        <div className="space-y-2">
          <div className="relative group inline-block max-w-full bg-white p-2 border border-slate-200 rounded-lg shadow-sm">
            <img
              src={imageUrl}
              alt="Original Question Image"
              className="max-h-[550px] w-auto object-contain cursor-zoom-in rounded"
              style={
                cropYPercent && cropYPercent > 0 && cropYPercent < 100
                  ? { clipPath: `inset(0 0 ${100 - cropYPercent}% 0)` }
                  : undefined
              }
              onError={() => setImageError(true)}
              onClick={() =>
                onZoomImage?.(
                  imageUrl,
                  cropYPercent ? 'Original PDF Question Image (Cropped Question Region)' : 'Original PDF Question Image'
                )
              }
            />
            {onZoomImage && (
              <button
                type="button"
                onClick={() =>
                  onZoomImage(
                    imageUrl,
                    cropYPercent ? 'Original PDF Question Image (Cropped Question Region)' : 'Original PDF Question Image'
                  )
                }
                className="absolute top-3 right-3 px-2 py-1 bg-slate-900/80 hover:bg-slate-900 text-white rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shadow"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Zoom Image</span>
              </button>
            )}
          </div>
        </div>
      ) : imageError ? (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs font-mono space-y-2 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                {question.sourceDocumentId || question.sourcePage
                  ? `Source document temporarily unavailable (${question.sourceDocumentId || 'Recorded'} • Page ${question.sourcePage || 'N/A'})`
                  : 'Original source unavailable because this question has no source document/page metadata.'}
              </span>
            </div>
            {question.sourceDocumentId || question.sourcePage ? (
              <button
                type="button"
                disabled={isRecovering}
                onClick={handleRecoverImage}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-sans text-xs font-bold transition-colors shrink-0 shadow-sm disabled:opacity-50"
              >
                {isRecovering ? 'Recovering...' : 'Recover Source Image'}
              </button>
            ) : null}
          </div>
          {recoverErrorMsg ? (
            <p className="text-xs font-sans text-rose-700 font-semibold bg-rose-50 p-2 rounded border border-rose-200">
              {recoverErrorMsg}
            </p>
          ) : (
            <p className="text-[11px] text-amber-700 font-sans">
              Document: {question.sourceDocument?.fileName || question.sourceDocumentId || 'N/A'} • Page: {question.sourcePage || 'N/A'}
            </p>
          )}
        </div>
      ) : (
        /* Fallback: Text only rendered if NO source PDF question image exists */
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-base leading-relaxed font-medium whitespace-pre-wrap">
          {rawText || <span className="text-slate-400 italic">No question text or image available</span>}
        </div>
      )}

      {/* 2. STRUCTURED OPTIONS OR INPUT AREA BELOW QUESTION IMAGE */}
      <div className="space-y-3 pt-2">
        {isNAT ? (
          <div className="max-w-md space-y-2 bg-slate-50 p-4 border border-slate-200 rounded-lg">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Numerical Answer Entry (NAT):
            </label>
            <input
              type="number"
              step="any"
              disabled={viewMode === 'SOLUTION_VIEW'}
              value={selectedAnswer !== undefined && selectedAnswer !== null ? selectedAnswer : ''}
              onChange={(e) => onSelectAnswer?.(e.target.value)}
              placeholder="Enter numerical value"
              className="erp-input font-mono font-bold text-emerald-700 bg-white text-base w-full"
            />
            <p className="text-[11px] text-slate-500 font-mono">
              Enter exact calculation result.
            </p>
            {showCorrectAnswer && (
              <div className="mt-3 text-xs font-mono text-emerald-800 bg-emerald-50 p-2.5 rounded border border-emerald-200">
                <span className="font-bold">Official NAT Answer: </span>
                {typeof question.correctAnswer === 'object' && question.correctAnswer !== null
                  ? JSON.stringify(question.correctAnswer)
                  : String(question.correctAnswer ?? question.rawAnswer ?? 'N/A')}
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
            {showCorrectAnswer && question.correctAnswer && (
              <div className="mt-3 text-xs text-slate-700 bg-blue-50 p-2.5 rounded border border-blue-200">
                <span className="font-bold text-[#1E40AF]">Reference Answer: </span>
                {typeof question.correctAnswer === 'object'
                  ? JSON.stringify(question.correctAnswer)
                  : String(question.correctAnswer)}
              </div>
            )}
          </div>
        ) : isMatch ? (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Match the Following Columns:
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs font-medium text-slate-800">
              <div className="space-y-2 p-3 bg-white border border-slate-200 rounded">
                <div className="font-bold text-slate-900 border-b pb-1">Group I</div>
                {((question.options as any)?.group1 || ['1', '2', '3']).map((item: any, i: number) => (
                  <div key={i} className="py-1 font-mono">
                    {i + 1}. {getOptionText(item) || String(item)}
                  </div>
                ))}
              </div>
              <div className="space-y-2 p-3 bg-white border border-slate-200 rounded">
                <div className="font-bold text-slate-900 border-b pb-1">Group II</div>
                {((question.options as any)?.group2 || ['P', 'Q', 'R']).map((item: any, i: number) => (
                  <div key={i} className="py-1 font-mono">
                    {String.fromCharCode(80 + i)}. {getOptionText(item) || String(item)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : isMCQorMSQ ? (
          optionsList.length > 0 ? (
            <div className="space-y-2.5">
              {optionsList.map((opt: any, optIdx: number) => {
                const selected = isOptionSelected(optIdx);
                const correct = isOptionCorrect(optIdx);

                let cardBorderClass = 'border-slate-200 bg-white hover:bg-slate-50';
                let badgeClass = 'bg-slate-100 text-slate-700 border-slate-300';

                if (showCorrectAnswer) {
                  if (correct && selected) {
                    cardBorderClass = 'border-emerald-500 bg-emerald-50/80 text-emerald-900 shadow-sm';
                    badgeClass = 'bg-emerald-600 text-white';
                  } else if (correct) {
                    cardBorderClass = 'border-emerald-400 bg-emerald-50/50 text-emerald-900';
                    badgeClass = 'bg-emerald-600 text-white';
                  } else if (selected) {
                    cardBorderClass = 'border-red-400 bg-red-50/80 text-red-900';
                    badgeClass = 'bg-red-600 text-white';
                  }
                } else if (selected) {
                  cardBorderClass = 'border-[#1E40AF] bg-blue-50/80 text-slate-900 shadow-sm';
                  badgeClass = 'bg-[#1E40AF] text-white';
                }

                return (
                  <button
                    key={optIdx}
                    type="button"
                    disabled={viewMode === 'SOLUTION_VIEW'}
                    onClick={() => handleOptionClick(optIdx)}
                    className={`w-full text-left p-3.5 rounded-md border transition-all flex items-start space-x-3.5 ${cardBorderClass}`}
                  >
                    <div
                      className={`w-7 h-7 rounded flex items-center justify-center font-mono font-bold text-xs shrink-0 mt-0.5 border ${badgeClass}`}
                    >
                      {String.fromCharCode(65 + optIdx)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <QuestionOptionContent
                        option={opt}
                        optionIndex={optIdx}
                        isSelected={selected}
                        isCorrect={showCorrectAnswer ? correct : undefined}
                        onZoomImage={onZoomImage}
                        textClassName="text-sm font-medium"
                      />
                    </div>
                    {showCorrectAnswer && (
                      <div className="shrink-0 self-center pl-2">
                        {correct ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        ) : selected ? (
                          <XCircle className="w-5 h-5 text-red-600" />
                        ) : null}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md space-y-2">
              <div className="text-xs text-slate-600 font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block shrink-0"></span>
                <span>Option choices are visible in the question image above.</span>
              </div>
              {showCorrectAnswer && (
                <div className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 p-2.5 rounded border border-emerald-200 flex items-center justify-between">
                  <span>Official Answer:</span>
                  <span className="px-2 py-0.5 bg-emerald-100 border border-emerald-300 rounded text-emerald-900 font-bold">
                    {Array.isArray(question.correctAnswer) && question.correctAnswer.length > 0
                      ? question.correctAnswer.join(', ')
                      : String(question.correctAnswer ?? question.rawAnswer ?? 'N/A')}
                  </span>
                </div>
              )}
            </div>
          )
        ) : null}
      </div>

      {/* 3. INTERNAL MACHINE-READABLE / SEARCH LAYER (OPTIONAL COLLAPSIBLE DRAWER FOR ADMIN/DEBUGGING) */}
      {(showInternalMetadata || viewMode === 'ADMIN_REVIEW' || viewMode === 'QUESTION_BANK') && (
        <div className="pt-3 border-t border-slate-200 text-xs">
          <button
            type="button"
            onClick={() => setShowOcrDrawer((p) => !p)}
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 font-mono text-[11px] font-medium transition-colors"
          >
            {showOcrDrawer ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>Internal OCR & Search Metadata Layer ({showOcrDrawer ? 'Hide' : 'Show'})</span>
          </button>
          {showOcrDrawer && (
            <div className="mt-2 p-3 bg-slate-900 text-slate-200 rounded-md font-mono text-xs space-y-2">
              <div>
                <span className="text-blue-400 font-bold">OCR Text (Search/RAG index):</span>
                <p className="mt-1 whitespace-pre-wrap text-slate-300">{rawText || '—'}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                <div>Source Image: {imageUrl || 'None'}</div>
                <div>Crop Y%: {cropYPercent !== null ? `${cropYPercent}%` : 'Full Image'}</div>
                <div>Verification Status: {question.verificationStatus || 'VERIFIED'}</div>
                <div>Question ID: {question.customId || question.id || 'N/A'}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
