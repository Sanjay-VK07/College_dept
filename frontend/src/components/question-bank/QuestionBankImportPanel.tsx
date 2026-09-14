'use client';

import React, { useRef } from 'react';
import { FileSpreadsheet, RefreshCw } from 'lucide-react';
import { JSONLImportPanel } from './JSONLImportPanel';

interface QuestionBankImportPanelProps {
  pdfTargetCount: string;
  setPdfTargetCount: (v: string) => void;
  onQuestionFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  pdfImportJob: any;
  onDismissPdfImportJob: () => void;
  onImportComplete: () => void;
}

const PDF_IMPORT_TERMINAL_STATUSES = ['COMPLETED', 'FAILED', 'GENERATED_PARTIAL_BATCH'];

/**
 * The one Question Bank import entry point — JSONL (normalized bulk question import) and
 * Excel/CSV/PDF (the existing, still-functional /admin/upload-questions flow) side by side.
 * Nothing here reimplements upload logic; it all defers to handlers already proven in
 * admin/dashboard/page.tsx (Excel/CSV/PDF) and JSONLImportPanel (JSONL, relocated from the
 * Smart Question Paper Builder).
 */
export const QuestionBankImportPanel: React.FC<QuestionBankImportPanelProps> = ({
  pdfTargetCount,
  setPdfTargetCount,
  onQuestionFileUpload,
  pdfImportJob,
  onDismissPdfImportJob,
  onImportComplete,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section className="erp-card space-y-3">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
          Chapter 1 Question Bank (.JSONL)
        </h3>
        <p className="text-xs text-slate-500">
          Normalized bulk import — question ID, text, options, answer, type, difficulty, origin,
          verification status, and full source traceability (document/page/chapter/section/heading)
          all preserved.
        </p>
        <JSONLImportPanel onImportComplete={onImportComplete} />
      </section>

      <section className="erp-card space-y-3">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
          Excel / CSV / PDF
        </h3>
        <p className="text-xs text-slate-500">
          Structured spreadsheet import, or a real PDF extraction pipeline (page-batched, OCR/vision
          for scanned pages, answer-key mapping) that runs as a background job.
        </p>

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700">
            Max questions to extract (PDF only, optional)
          </label>
          <input
            type="number"
            min={1}
            placeholder="Leave blank to extract every confidently-matched question"
            value={pdfTargetCount}
            onChange={(e) => setPdfTargetCount(e.target.value)}
            className="erp-select text-xs py-1.5 w-full"
          />
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full erp-btn-primary py-2 text-xs justify-center"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Browse File (.xlsx, .xls, .csv, .pdf, .zip)</span>
        </button>
        <p className="text-[11px] text-slate-500">
          A .zip may contain any mix of these file types — each is imported/queued individually.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.pdf,.zip"
          onChange={onQuestionFileUpload}
          className="hidden"
        />

        {pdfImportJob && (
          <div
            className={`erp-card space-y-2 border-l-4 ${
              pdfImportJob.status === 'COMPLETED'
                ? 'border-l-emerald-500'
                : pdfImportJob.status === 'FAILED'
                ? 'border-l-red-500'
                : pdfImportJob.status === 'GENERATED_PARTIAL_BATCH'
                ? 'border-l-amber-500'
                : 'border-l-blue-500'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                {!PDF_IMPORT_TERMINAL_STATUSES.includes(pdfImportJob.status) && (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                )}
                Extracting from: {pdfImportJob.fileName}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  {pdfImportJob.status}
                </span>
                {PDF_IMPORT_TERMINAL_STATUSES.includes(pdfImportJob.status) && (
                  <button onClick={onDismissPdfImportJob} className="text-slate-400 hover:text-slate-700 text-xs">
                    ✕
                  </button>
                )}
              </div>
            </div>
            {!!pdfImportJob.totalPages && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-600">
                  <span>
                    Pages processed: <strong>{pdfImportJob.pagesProcessed ?? 0}</strong> / {pdfImportJob.totalPages}
                    {pdfImportJob.structureStatus ? ` (${pdfImportJob.structureStatus})` : ''}
                  </span>
                  <span>{Math.round(((pdfImportJob.pagesProcessed ?? 0) / pdfImportJob.totalPages) * 100)}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.round(((pdfImportJob.pagesProcessed ?? 0) / pdfImportJob.totalPages) * 100))}%` }}
                  />
                </div>
              </div>
            )}
            {typeof pdfImportJob.generatedCount === 'number' && (
              <div className="flex items-center gap-3 text-[11px] font-mono text-slate-600">
                <span>Imported: <strong>{pdfImportJob.generatedCount}</strong>{pdfImportJob.requestedCount ? ` / ${pdfImportJob.requestedCount}` : ''}</span>
                <span className="text-teal-700">Auto-published: <strong>{pdfImportJob.autoPublishedCount ?? 0}</strong></span>
                <span className="text-sky-700">Awaiting review: <strong>{pdfImportJob.pendingReviewCount ?? 0}</strong></span>
                <span className="text-amber-700">Duplicates skipped: <strong>{pdfImportJob.duplicateCount ?? 0}</strong></span>
              </div>
            )}
            {pdfImportJob.message && <p className="text-xs text-slate-600">{pdfImportJob.message}</p>}
          </div>
        )}
      </section>
    </div>
  );
};
