'use client';

import React, { useState, useRef, useEffect } from 'react';
import { CheckCircle2, X, Loader2, ArrowRight, UploadCloud } from 'lucide-react';
import { aiService } from '@/services/aiService';

interface JSONLImportPanelProps {
  onImportComplete?: () => void;
}

/**
 * Relocated from the Smart Question Paper Builder's header — this is the one real entry point
 * for JSONL bulk question import (preview -> required subject picker -> transactional import),
 * now living in Question Bank's Import / Extract sub-tab alongside the Excel/CSV/PDF importer.
 */
export const JSONLImportPanel: React.FC<JSONLImportPanelProps> = ({ onImportComplete }) => {
  const [subjects, setSubjects] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [jsonlFile, setJsonlFile] = useState<File | null>(null);
  const [jsonlPreview, setJsonlPreview] = useState<any | null>(null);
  const [jsonlImportResult, setJsonlImportResult] = useState<any | null>(null);
  const [isParsingJSONL, setIsParsingJSONL] = useState(false);
  const [isImportingJSONL, setIsImportingJSONL] = useState(false);
  const [jsonlTargetSubjectId, setJsonlTargetSubjectId] = useState<string>('');
  const [jsonlNewSubjectName, setJsonlNewSubjectName] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    aiService
      .getQuestionBankSubjects()
      .then((res) => {
        if (res?.success) setSubjects(res.data || []);
      })
      .catch(() => {
        /* subject list is optional convenience — a new subject can still be named manually */
      });
  }, []);

  const handleSelectJSONLFile = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setErrorMsg(null);
    setJsonlFile(file);
    setIsParsingJSONL(true);
    setJsonlPreview(null);
    setJsonlImportResult(null);
    setJsonlTargetSubjectId('');
    setJsonlNewSubjectName('');

    try {
      const res = await aiService.previewJSONLImport(file);
      if (res?.success) {
        setJsonlPreview(res.data);
      } else {
        setErrorMsg(res?.message || 'Failed to parse JSONL file.');
      }
    } catch (e: any) {
      setErrorMsg(e.response?.data?.message || 'Failed to parse JSONL file.');
    } finally {
      setIsParsingJSONL(false);
    }
  };

  const handleExecuteJSONLImport = async () => {
    if (!jsonlFile && !jsonlPreview) return;
    if (!jsonlTargetSubjectId && !jsonlNewSubjectName.trim()) {
      setErrorMsg('Select a target subject (or name a new one) before importing — the questions in this file need a real home, not a guessed one.');
      return;
    }
    setErrorMsg(null);
    setIsImportingJSONL(true);

    try {
      const target = jsonlTargetSubjectId
        ? { subjectId: jsonlTargetSubjectId }
        : { subjectName: jsonlNewSubjectName.trim() };
      const res = await aiService.importJSONL(jsonlFile!, target);
      if (res?.success) {
        setJsonlImportResult(res.data);
      } else {
        setErrorMsg(res?.message || 'JSONL Import failed.');
      }
    } catch (e: any) {
      setErrorMsg(e.response?.data?.message || 'JSONL Import failed.');
    } finally {
      setIsImportingJSONL(false);
    }
  };

  return (
    <div className="space-y-4">
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded p-3 flex items-start gap-2.5 text-red-800">
          <X className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="text-xs">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-auto text-red-400 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {!jsonlPreview && !jsonlImportResult && (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 rounded p-8 text-center bg-slate-50/50 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-colors"
        >
          {isParsingJSONL ? (
            <Loader2 className="w-8 h-8 text-emerald-600 mx-auto mb-2 animate-spin" />
          ) : (
            <UploadCloud className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          )}
          <p className="text-sm font-semibold text-slate-800">{isParsingJSONL ? 'Parsing...' : 'Upload Question Bank (.JSONL or .ZIP)'}</p>
          <p className="text-xs text-slate-500 mt-1">One JSON object per line — question ID, text, options, answer, type, source metadata. A .zip of several .jsonl files is combined into one import under a single target subject.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".jsonl,.txt,.zip"
            className="hidden"
            onChange={(e) => { handleSelectJSONLFile(e.target.files); e.target.value = ''; }}
          />
        </div>
      )}

      {/* JSONL IMPORT PREVIEW */}
      {jsonlPreview && !jsonlImportResult && (
        <section className="bg-white border-2 border-emerald-600 rounded p-6 space-y-5 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-sm font-bold uppercase text-slate-900">Question Bank Import Preview</h2>
              <p className="text-xs text-slate-500 mt-0.5">File: <span className="font-mono font-bold text-slate-800">{jsonlPreview.fileName}</span></p>
            </div>
            <button onClick={() => setJsonlPreview(null)} className="text-slate-400 hover:text-slate-700">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Target Subject — required. Never guessed from file content. */}
          <div className="bg-amber-50 border border-amber-200 rounded p-3 space-y-2">
            <label className="block text-xs font-bold text-amber-900 uppercase tracking-wider">
              Import Into Subject <span className="text-red-600">*</span>
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={jsonlTargetSubjectId}
                onChange={(e) => { setJsonlTargetSubjectId(e.target.value); if (e.target.value) setJsonlNewSubjectName(''); }}
                className="flex-1 p-2 border border-slate-300 rounded text-xs bg-white"
              >
                <option value="">— Create a new subject —</option>
                {subjects.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
              {!jsonlTargetSubjectId && (
                <input
                  type="text"
                  value={jsonlNewSubjectName}
                  onChange={(e) => setJsonlNewSubjectName(e.target.value)}
                  placeholder="New subject name, e.g. Data Structures"
                  className="flex-1 p-2 border border-slate-300 rounded text-xs"
                />
              )}
            </div>
            <p className="text-[11px] text-amber-800">
              These {jsonlPreview.totalRecords} records will be organized under this subject as one module ("Chapter 1") with a topic per {jsonlPreview.topicsCount} distinct topic heading in the file.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 text-xs font-mono text-center">
            <div className="p-3 bg-slate-50 border rounded">
              <div className="text-slate-500 text-[10px]">Records</div>
              <div className="font-bold text-slate-900 mt-1">{jsonlPreview.totalRecords}</div>
            </div>
            <div className="p-3 bg-slate-50 border rounded">
              <div className="text-slate-500 text-[10px]">Topics</div>
              <div className="font-bold text-slate-900 mt-1">{jsonlPreview.topicsCount}</div>
            </div>
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded">
              <div className="text-emerald-700 text-[10px]">Verified</div>
              <div className="font-bold text-emerald-900 mt-1">{jsonlPreview.verifiedCount}</div>
            </div>
            <div className="p-3 bg-slate-100 border border-slate-300 rounded">
              <div className="text-slate-700 text-[10px]">Unanswered</div>
              <div className="font-bold text-slate-900 mt-1">{jsonlPreview.unansweredInSourceCount}</div>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded">
              <div className="text-amber-700 text-[10px]">Needs Review</div>
              <div className="font-bold text-amber-900 mt-1">{jsonlPreview.needsReviewCount}</div>
            </div>
            <div className="p-3 bg-slate-50 border rounded">
              <div className="text-slate-500 text-[10px]">Rejected</div>
              <div className="font-bold text-slate-900 mt-1">{jsonlPreview.rejectedCount}</div>
            </div>
            <div className="p-3 bg-slate-50 border rounded">
              <div className="text-slate-500 text-[10px]">Duplicates</div>
              <div className="font-bold text-slate-900 mt-1">{jsonlPreview.duplicateCount}</div>
            </div>
            <div className="p-3 bg-slate-50 border rounded">
              <div className="text-slate-500 text-[10px]">Invalid</div>
              <div className="font-bold text-slate-900 mt-1">{jsonlPreview.invalidCount}</div>
            </div>
          </div>

          {/* Topic Breakdown Table */}
          <div className="border border-slate-200 rounded max-h-60 overflow-y-auto">
            <table className="w-full text-xs font-mono">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                <tr className="text-left">
                  <th className="px-3 py-2 font-semibold">Topic</th>
                  <th className="px-3 py-2 font-semibold text-center">Total</th>
                  <th className="px-3 py-2 font-semibold text-center">Verified</th>
                  <th className="px-3 py-2 font-semibold text-center">Unanswered</th>
                  <th className="px-3 py-2 font-semibold text-center">Needs Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jsonlPreview.topicBreakdown.map((t: any) => (
                  <tr key={t.topicHeading}>
                    <td className="px-3 py-2 font-semibold text-slate-900">{t.topicHeading}</td>
                    <td className="px-3 py-2 text-center">{t.total}</td>
                    <td className="px-3 py-2 text-center text-emerald-700 font-bold">{t.verified}</td>
                    <td className="px-3 py-2 text-center text-slate-600">{t.unansweredInSource}</td>
                    <td className="px-3 py-2 text-center text-amber-700">{t.needsReview}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button onClick={() => setJsonlPreview(null)} className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded hover:bg-slate-50">
              Cancel
            </button>
            <button
              onClick={handleExecuteJSONLImport}
              disabled={isImportingJSONL || (!jsonlTargetSubjectId && !jsonlNewSubjectName.trim())}
              title={!jsonlTargetSubjectId && !jsonlNewSubjectName.trim() ? 'Choose or name a target subject first' : undefined}
              className="px-6 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded flex items-center gap-1.5 disabled:opacity-50"
            >
              {isImportingJSONL ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Import {jsonlPreview.totalRecords} Questions to PostgreSQL
            </button>
          </div>
        </section>
      )}

      {/* JSONL IMPORT COMPLETION SCREEN */}
      {jsonlImportResult && (
        <section className="bg-emerald-50 border-2 border-emerald-600 rounded p-6 space-y-4 text-emerald-950">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            <div>
              <h2 className="text-base font-bold uppercase">IMPORT COMPLETE</h2>
              <p className="text-xs text-emerald-800 mt-0.5">
                Successfully transactionally imported {jsonlImportResult.importedCount} questions into PostgreSQL.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 text-xs font-mono text-center">
            <div className="p-2.5 bg-white border border-emerald-200 rounded">
              <div className="text-slate-500 text-[10px]">Processed</div>
              <div className="font-bold text-slate-900">{jsonlImportResult.totalProcessed}</div>
            </div>
            <div className="p-2.5 bg-white border border-emerald-200 rounded">
              <div className="text-slate-500 text-[10px]">Imported</div>
              <div className="font-bold text-emerald-700">{jsonlImportResult.importedCount}</div>
            </div>
            <div className="p-2.5 bg-white border border-emerald-200 rounded">
              <div className="text-slate-500 text-[10px]">Skipped</div>
              <div className="font-bold text-slate-700">{jsonlImportResult.skippedCount}</div>
            </div>
            <div className="p-2.5 bg-white border border-emerald-200 rounded">
              <div className="text-slate-500 text-[10px]">Duplicates</div>
              <div className="font-bold text-slate-700">{jsonlImportResult.duplicateCount}</div>
            </div>
            <div className="p-2.5 bg-white border border-emerald-200 rounded">
              <div className="text-slate-500 text-[10px]">VERIFIED</div>
              <div className="font-bold text-emerald-700">{jsonlImportResult.verifiedCount}</div>
            </div>
            <div className="p-2.5 bg-white border border-emerald-200 rounded">
              <div className="text-slate-500 text-[10px]">UNANSWERED</div>
              <div className="font-bold text-slate-700">{jsonlImportResult.unansweredCount}</div>
            </div>
            <div className="p-2.5 bg-white border border-emerald-200 rounded">
              <div className="text-slate-500 text-[10px]">NEEDS REVIEW</div>
              <div className="font-bold text-amber-700">{jsonlImportResult.needsReviewCount}</div>
            </div>
            <div className="p-2.5 bg-white border border-emerald-200 rounded">
              <div className="text-slate-500 text-[10px]">REJECTED</div>
              <div className="font-bold text-slate-700">{jsonlImportResult.rejectedCount}</div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => {
                setJsonlImportResult(null);
                setJsonlPreview(null);
                setJsonlFile(null);
                onImportComplete?.();
              }}
              className="px-5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded flex items-center gap-1.5"
            >
              View Question Bank <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}
    </div>
  );
};
