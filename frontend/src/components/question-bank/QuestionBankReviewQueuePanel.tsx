'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  Eye,
  Check,
  X,
  FileText,
  Image as ImageIcon,
  Sparkles,
  Zap,
} from 'lucide-react';
import api from '@/lib/api';

interface QuestionBankReviewQueuePanelProps {
  questions: any[];
  onRefreshData: () => void;
  onSelectQuestion: (question: any) => void;
  showToast: (msg: string) => void;
  onZoomImage?: (url: string, title?: string) => void;
}

export const QuestionBankReviewQueuePanel: React.FC<QuestionBankReviewQueuePanelProps> = ({
  questions,
  onRefreshData,
  onSelectQuestion,
  showToast,
  onZoomImage,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'NEEDS_REVIEW' | 'VERIFIED' | 'MISSING_OPTIONS' | 'MISSING_ANSWER'>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');

  // Diagnostic Stats
  const totalCount = questions.length;
  const needsReviewCount = questions.filter((q) => q.verificationStatus === 'NEEDS_REVIEW').length;
  const verifiedCount = questions.filter((q) => q.verificationStatus === 'VERIFIED').length;
  const missingOptionsCount = questions.filter(
    (q) => (!q.options || (Array.isArray(q.options) && q.options.length === 0)) && (q.type === 'MCQ' || q.type === 'MSQ')
  ).length;
  const missingAnswerCount = questions.filter(
    (q) => !q.correctAnswer || (Array.isArray(q.correctAnswer) && q.correctAnswer.length === 0)
  ).length;

  // Filtered Questions
  const filteredQuestions = questions.filter((q) => {
    if (search) {
      const qLower = search.toLowerCase().trim();
      const codeMatch = (q.customId || q.id || '').toLowerCase().includes(qLower);
      const textMatch = (q.text || '').toLowerCase().includes(qLower);
      const docMatch = (q.sourceDocumentId || '').toLowerCase().includes(qLower);
      if (!codeMatch && !textMatch && !docMatch) return false;
    }
    if (statusFilter === 'NEEDS_REVIEW') return q.verificationStatus === 'NEEDS_REVIEW';
    if (statusFilter === 'VERIFIED') return q.verificationStatus === 'VERIFIED';
    if (statusFilter === 'MISSING_OPTIONS') return (!q.options || q.options.length === 0) && (q.type === 'MCQ' || q.type === 'MSQ');
    if (statusFilter === 'MISSING_ANSWER') return !q.correctAnswer || (Array.isArray(q.correctAnswer) && q.correctAnswer.length === 0);
    return true;
  });

  // Bulk Actions
  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === filteredQuestions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredQuestions.map((q) => q.id)));
    }
  };

  const handleAutoRecoverAll = async () => {
    setIsProcessing(true);
    setProcessingMsg('Running automatic recovery sequence over imported questions...');
    try {
      const res = await api.post('/admin/questions/bulk-recovery', { autoVerify: true });
      if (res.data?.success) {
        const s = res.data.summary;
        showToast(`Auto-recovery complete: ${s?.verifiedCount || 0} questions verified & recovered!`);
        onRefreshData();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to run bulk recovery');
    } finally {
      setIsProcessing(false);
      setProcessingMsg('');
    }
  };

  const handleBulkStatusChange = async (status: 'VERIFIED' | 'NEEDS_REVIEW') => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      showToast('Please select at least one question row.');
      return;
    }
    setIsProcessing(true);
    setProcessingMsg(`Updating status of ${ids.length} questions to ${status}...`);
    try {
      const res = await api.post('/admin/questions/bulk-status', { ids, verificationStatus: status });
      if (res.data?.success) {
        showToast(`Updated ${ids.length} questions to ${status}`);
        setSelectedIds(new Set());
        onRefreshData();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to update question status');
    } finally {
      setIsProcessing(false);
      setProcessingMsg('');
    }
  };

  const handleSingleApprove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await api.post('/admin/questions/bulk-status', { ids: [id], verificationStatus: 'VERIFIED' });
      if (res.data?.success) {
        showToast('Question marked VERIFIED');
        onRefreshData();
      }
    } catch (err: any) {
      showToast('Failed to approve question');
    }
  };

  const [recoveryStats, setRecoveryStats] = useState<{
    totalQuestions: number;
    recoveredCount: number;
    remainingCount: number;
    failedCount: number;
  }>({
    totalQuestions: questions.length,
    recoveredCount: questions.filter((q) => q.imageUrl || q.containsFigure).length,
    remainingCount: questions.filter((q) => !q.imageUrl && !q.containsFigure).length,
    failedCount: 0,
  });

  const handleRecoverAllSourceImages = async () => {
    setIsProcessing(true);
    setProcessingMsg('Recovering PDF source page images in batches of 50...');
    try {
      const res = await api.post('/admin/questions/recover-source-images', { batchSize: 50 });
      if (res.data?.success) {
        const s = res.data.summary;
        setRecoveryStats({
          totalQuestions: s.totalQuestions || totalCount,
          recoveredCount: s.recoveredCount || 0,
          remainingCount: s.remainingCount || 0,
          failedCount: s.failedCount || 0,
        });
        showToast(`Bulk image recovery complete! Recovered ${s.recoveredCount || 0} source images.`);
        onRefreshData();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Bulk image recovery failed');
    } finally {
      setIsProcessing(false);
      setProcessingMsg('');
    }
  };

  return (
    <div className="space-y-4">
      {/* Source Images Bulk Recovery Panel */}
      <div className="p-4 bg-slate-900 text-slate-100 rounded-lg shadow-md space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-sm text-slate-100">Source Images Automated Recovery</h3>
            <span className="px-2 py-0.5 bg-blue-900/60 text-blue-300 rounded font-mono text-[10px] font-bold">
              PDF Engine Active
            </span>
          </div>
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleRecoverAllSourceImages}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md font-bold text-xs flex items-center gap-2 transition-colors disabled:opacity-50 shadow"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>{isProcessing ? 'Recovering Source Images...' : 'Recover All Missing Images'}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-2.5 bg-slate-800/80 rounded border border-slate-700">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Total Questions</span>
            <span className="text-base font-bold text-slate-100">{recoveryStats.totalQuestions || totalCount}</span>
          </div>
          <div className="p-2.5 bg-slate-800/80 rounded border border-slate-700">
            <span className="text-emerald-400 block text-[10px] uppercase font-bold">Recovered / Available</span>
            <span className="text-base font-bold text-emerald-300">{recoveryStats.recoveredCount}</span>
          </div>
          <div className="p-2.5 bg-slate-800/80 rounded border border-slate-700">
            <span className="text-amber-400 block text-[10px] uppercase font-bold">Remaining Needing Recover</span>
            <span className="text-base font-bold text-amber-300">{recoveryStats.remainingCount}</span>
          </div>
          <div className="p-2.5 bg-slate-800/80 rounded border border-slate-700">
            <span className="text-red-400 block text-[10px] uppercase font-bold">Failed / Unrecoverable</span>
            <span className="text-base font-bold text-red-300">{recoveryStats.failedCount}</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
          <div
            className="bg-emerald-500 h-full transition-all duration-300"
            style={{
              width: `${
                recoveryStats.totalQuestions > 0
                  ? Math.round((recoveryStats.recoveredCount / recoveryStats.totalQuestions) * 100)
                  : 0
              }%`,
            }}
          />
        </div>
      </div>
      {/* Diagnostic Counter Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div
          onClick={() => setStatusFilter('ALL')}
          className={`erp-card cursor-pointer transition-all ${
            statusFilter === 'ALL' ? 'border-[#1E40AF] bg-blue-50/50 shadow-sm' : 'hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-bold uppercase text-slate-500">Total Questions</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{totalCount}</div>
        </div>

        <div
          onClick={() => setStatusFilter('NEEDS_REVIEW')}
          className={`erp-card cursor-pointer transition-all ${
            statusFilter === 'NEEDS_REVIEW' ? 'border-amber-500 bg-amber-50/50 shadow-sm' : 'hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-bold uppercase text-amber-700 flex items-center justify-between">
            <span>Needs Review</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-xl font-bold text-amber-900 mt-1">{needsReviewCount}</div>
        </div>

        <div
          onClick={() => setStatusFilter('VERIFIED')}
          className={`erp-card cursor-pointer transition-all ${
            statusFilter === 'VERIFIED' ? 'border-emerald-500 bg-emerald-50/50 shadow-sm' : 'hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-bold uppercase text-emerald-700 flex items-center justify-between">
            <span>Verified</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-xl font-bold text-emerald-900 mt-1">{verifiedCount}</div>
        </div>

        <div
          onClick={() => setStatusFilter('MISSING_OPTIONS')}
          className={`erp-card cursor-pointer transition-all ${
            statusFilter === 'MISSING_OPTIONS' ? 'border-indigo-500 bg-indigo-50/50 shadow-sm' : 'hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-bold uppercase text-indigo-700">Missing Options</div>
          <div className="text-xl font-bold text-indigo-900 mt-1">{missingOptionsCount}</div>
        </div>

        <div
          onClick={() => setStatusFilter('MISSING_ANSWER')}
          className={`erp-card cursor-pointer transition-all ${
            statusFilter === 'MISSING_ANSWER' ? 'border-purple-500 bg-purple-50/50 shadow-sm' : 'hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-bold uppercase text-purple-700">Missing Answer</div>
          <div className="text-xl font-bold text-purple-900 mt-1">{missingAnswerCount}</div>
        </div>
      </div>

      {/* Main Action Bar & Filters */}
      <div className="erp-card flex flex-wrap items-center justify-between gap-3 bg-white">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code, text, document..."
              className="erp-input text-xs py-1.5 pl-8 w-full"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="erp-select text-xs py-1.5"
          >
            <option value="ALL">All Statuses ({totalCount})</option>
            <option value="NEEDS_REVIEW">Needs Review ({needsReviewCount})</option>
            <option value="VERIFIED">Verified ({verifiedCount})</option>
            <option value="MISSING_OPTIONS">Missing Options ({missingOptionsCount})</option>
            <option value="MISSING_ANSWER">Missing Answer ({missingAnswerCount})</option>
          </select>
        </div>

        {/* Bulk Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleAutoRecoverAll}
            disabled={isProcessing}
            className="erp-btn-primary py-1.5 px-3 text-xs bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800"
            title="Automatically recovers missing crop paths, extracted options, answer keys, and sets VERIFIED status"
          >
            <Zap className="w-3.5 h-3.5 mr-1 animate-pulse text-amber-300" />
            <span>Auto-Recover & Verify All</span>
          </button>

          {selectedIds.size > 0 && (
            <>
              <button
                onClick={() => handleBulkStatusChange('VERIFIED')}
                disabled={isProcessing}
                className="erp-btn-secondary py-1.5 px-3 text-xs text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100"
              >
                <Check className="w-3.5 h-3.5 mr-1" />
                <span>Approve Selected ({selectedIds.size})</span>
              </button>

              <button
                onClick={() => handleBulkStatusChange('NEEDS_REVIEW')}
                disabled={isProcessing}
                className="erp-btn-secondary py-1.5 px-3 text-xs text-amber-700 border-amber-300 bg-amber-50 hover:bg-amber-100"
              >
                <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                <span>Mark Needs Review ({selectedIds.size})</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Processing Indicator */}
      {isProcessing && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-xs font-semibold text-blue-900 flex items-center gap-2 animate-pulse">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-700" />
          <span>{processingMsg}</span>
        </div>
      )}

      {/* Data Table */}
      <div className="erp-table-container">
        <table className="erp-table">
          <thead>
            <tr>
              <th className="w-8">
                <input
                  type="checkbox"
                  checked={filteredQuestions.length > 0 && selectedIds.size === filteredQuestions.length}
                  onChange={handleToggleSelectAll}
                  className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </th>
              <th>Question Code</th>
              <th>Preview Image</th>
              <th>Diagnostic State</th>
              <th>Subject / Topic</th>
              <th>Options / Answer</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredQuestions.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500 text-xs">
                  No questions match the current filter criteria.
                </td>
              </tr>
            ) : (
              filteredQuestions.map((q) => {
                const imgUrl = `/api/questions/${q.id || q.customId}/image`;
                const isVerified = q.verificationStatus === 'VERIFIED';
                const hasOptions = Array.isArray(q.options) && q.options.length > 0;
                const hasAnswer = Array.isArray(q.correctAnswer) && q.correctAnswer.length > 0;
                const qCode = q.customId || q.id.slice(0, 8);

                return (
                  <tr
                    key={q.id}
                    onClick={() => onSelectQuestion(q)}
                    className={`cursor-pointer hover:bg-slate-50/80 transition-colors ${
                      selectedIds.has(q.id) ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(q.id)}
                        onChange={() => handleToggleSelect(q.id)}
                        className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="font-mono font-bold text-[#1E40AF] text-xs">{qCode}</td>

                    {/* Image Preview Thumbnail */}
                    <td>
                      <div className="w-16 h-10 bg-slate-100 border border-slate-200 rounded overflow-hidden flex items-center justify-center relative group">
                        <img
                          src={imgUrl}
                          alt={qCode}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onZoomImage?.(imgUrl, `Question ${qCode}`);
                          }}
                          className="absolute inset-0 bg-slate-900/60 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>

                    {/* Diagnostic Reason */}
                    <td className="max-w-xs">
                      <div className="text-[11px] font-semibold text-slate-800 truncate">
                        {q.text ? q.text.slice(0, 60) : `[Image-First Question]` }
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {q.sourceDocumentId ? `Doc: ${q.sourceDocumentId.slice(0, 12)}...` : 'Source PDF Document'}
                        {q.sourcePage ? ` • Page ${q.sourcePage}` : ''}
                      </div>
                    </td>

                    {/* Taxonomy */}
                    <td className="text-xs font-medium text-slate-700 max-w-xs truncate">
                      {q.subtopic?.topic?.module?.subject?.name || 'General Subject'}
                    </td>

                    {/* Options & Answer Summary */}
                    <td className="text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded font-mono font-bold ${
                            hasOptions ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {hasOptions ? `${q.options.length} Opts` : 'No Opts'}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded font-mono font-bold ${
                            hasAnswer ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {hasAnswer ? `Ans: ${JSON.stringify(q.correctAnswer)}` : 'No Ans'}
                        </span>
                      </div>
                    </td>

                    {/* Verification Badge */}
                    <td>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                          isVerified ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {isVerified ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        <span>{isVerified ? 'Verified' : 'Needs Review'}</span>
                      </span>
                    </td>

                    {/* Action Buttons */}
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {!isVerified && (
                          <button
                            onClick={(e) => handleSingleApprove(q.id, e)}
                            className="p-1 text-emerald-700 hover:bg-emerald-50 rounded"
                            title="Approve & Mark Verified"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => onSelectQuestion(q)}
                          className="p-1 text-blue-700 hover:bg-blue-50 rounded text-xs font-semibold"
                          title="Open Detail & Edit Modal"
                        >
                          Inspect
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
