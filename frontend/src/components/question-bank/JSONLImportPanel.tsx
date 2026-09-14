'use client';

import React, { useState, useRef, useEffect } from 'react';
import { CheckCircle2, CheckCircle, AlertCircle, X, Loader2, ArrowRight, UploadCloud, AlertTriangle, Image as ImageIcon, FileArchive } from 'lucide-react';
import { aiService } from '@/services/aiService';

interface JSONLImportPanelProps {
  onImportComplete?: () => void;
}

export const JSONLImportPanel: React.FC<JSONLImportPanelProps> = ({ onImportComplete }) => {
  const [subjects, setSubjects] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [importResult, setImportResult] = useState<any | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [targetSubjectId, setTargetSubjectId] = useState<string>('');
  const [newSubjectName, setNewSubjectName] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    aiService
      .getQuestionBankSubjects()
      .then((res) => {
        if (res?.success) {
          const list = res.data || [];
          setSubjects(list);
          // Default to Computer Science / COA subject if found
          const defaultSubj = list.find((s: any) => s.code?.includes('COA') || s.name?.includes('Computer'));
          if (defaultSubj) {
            setTargetSubjectId(defaultSubj.id);
          } else if (list.length > 0) {
            setTargetSubjectId(list[0].id);
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleSelectFile = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setErrorMsg(null);
    setUploadedFile(file);
    setIsParsing(true);
    setPreviewData(null);
    setImportResult(null);

    try {
      const res = await aiService.previewJSONLImport(file);
      if (res?.success) {
        setPreviewData(res.data);
      } else {
        setErrorMsg(res?.message || 'Failed to parse uploaded package.');
      }
    } catch (e: any) {
      setErrorMsg(e.response?.data?.message || 'Failed to parse uploaded package.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!uploadedFile && !previewData) return;
    if (!targetSubjectId && !newSubjectName.trim()) {
      setErrorMsg('Select a target subject (or name a new one) before importing.');
      return;
    }
    setErrorMsg(null);
    setIsImporting(true);

    try {
      const target = targetSubjectId
        ? { subjectId: targetSubjectId }
        : { subjectName: newSubjectName.trim() };
      const res = await aiService.importJSONL(uploadedFile!, target);
      if (res?.success) {
        setImportResult(res.data);
      } else {
        setErrorMsg(res?.message || 'Question Bank Import failed.');
      }
    } catch (e: any) {
      setErrorMsg(e.response?.data?.message || 'Question Bank Import failed.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded p-3 flex items-start gap-2.5 text-red-800">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" />
          <span className="text-xs">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-auto text-red-400 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {!previewData && !importResult && (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 rounded-lg p-7 text-center bg-slate-50/60 cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/30 transition-all group"
        >
          {isParsing ? (
            <Loader2 className="w-9 h-9 text-emerald-600 mx-auto mb-2 animate-spin" />
          ) : (
            <div className="flex justify-center items-center gap-2 mb-2 text-slate-500 group-hover:text-emerald-700">
              <FileArchive className="w-8 h-8 text-emerald-600" />
            </div>
          )}
          <p className="text-sm font-bold text-slate-800">
            {isParsing ? 'Inspecting package and resolving figures...' : 'Upload Question Bank Dataset'}
          </p>
          <div className="flex items-center justify-center gap-2 mt-1">
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
              Recommended: ZIP (JSONL + figures)
            </span>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700">
              Direct .JSONL
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto">
            Upload <code>Chapter_01.zip</code> containing <code>Chapter_01.jsonl</code> and associated <code>figures/</code> directory.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.jsonl,.txt"
            className="hidden"
            onChange={(e) => {
              handleSelectFile(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {/* IMPORT PREVIEW SCREEN */}
      {previewData && !importResult && (
        <section className="bg-white border-2 border-emerald-600 rounded-lg p-5 space-y-4 shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">Question Bank Import Preview</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                File: <span className="font-mono font-bold text-slate-900">{previewData.fileName}</span>
              </p>
            </div>
            <button onClick={() => setPreviewData(null)} className="text-slate-400 hover:text-slate-700">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Missing Figures Alert if any */}
          {previewData.missingFiguresCount > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded p-3 text-amber-900 text-xs space-y-1.5">
              <div className="font-bold flex items-center gap-1.5 text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Missing Figure Assets ({previewData.missingFiguresCount}):</span>
              </div>
              <p className="text-[11px] text-amber-800">
                The following figures are referenced in the JSONL but not found in the uploaded package's figures directory:
              </p>
              <div className="max-h-24 overflow-y-auto space-y-1 font-mono text-[11px] bg-white/70 p-2 rounded border border-amber-200">
                {previewData.missingFigures.map((mf: any, idx: number) => (
                  <div key={idx}>
                    Question ID: <b>{mf.questionId}</b> — Ref: <code>{mf.reference}</code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Target Subject Picker */}
          <div className="bg-slate-50 border border-slate-200 rounded p-3 space-y-2">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
              Target Subject <span className="text-red-600">*</span>
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={targetSubjectId}
                onChange={(e) => {
                  setTargetSubjectId(e.target.value);
                  if (e.target.value) setNewSubjectName('');
                }}
                className="flex-1 p-2 border border-slate-300 rounded text-xs bg-white font-medium"
              >
                <option value="">— Create a new subject —</option>
                {subjects.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
              {!targetSubjectId && (
                <input
                  type="text"
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  placeholder="New subject name, e.g. Computer Organization"
                  className="flex-1 p-2 border border-slate-300 rounded text-xs"
                />
              )}
            </div>
          </div>

          {/* Core Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 text-xs font-mono text-center">
            <div className="p-2.5 bg-slate-50 border rounded">
              <div className="text-slate-500 text-[10px]">Questions detected</div>
              <div className="font-bold text-slate-900 text-sm mt-0.5">{previewData.totalRecords}</div>
            </div>
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded">
              <div className="text-emerald-700 text-[10px]">Questions valid</div>
              <div className="font-bold text-emerald-900 text-sm mt-0.5">{previewData.validCount ?? previewData.totalRecords}</div>
            </div>
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded">
              <div className="text-blue-700 text-[10px] flex items-center justify-center gap-1">
                <ImageIcon className="w-3 h-3" /> With figures
              </div>
              <div className="font-bold text-blue-900 text-sm mt-0.5">{previewData.questionsWithFigures ?? 0}</div>
            </div>
            <div className={`p-2.5 border rounded ${previewData.missingFiguresCount > 0 ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-slate-50'}`}>
              <div className="text-slate-500 text-[10px]">Missing figures</div>
              <div className="font-bold text-sm mt-0.5">{previewData.missingFiguresCount ?? 0}</div>
            </div>
            <div className="p-2.5 bg-slate-50 border rounded">
              <div className="text-slate-500 text-[10px]">Duplicate questions</div>
              <div className="font-bold text-slate-900 text-sm mt-0.5">{previewData.duplicateCount ?? 0}</div>
            </div>
            <div className="p-2.5 bg-slate-50 border rounded">
              <div className="text-slate-500 text-[10px]">Invalid records</div>
              <div className="font-bold text-slate-900 text-sm mt-0.5">{previewData.invalidCount ?? 0}</div>
            </div>
          </div>

          {/* Topic Breakdown Table */}
          {Array.isArray(previewData.topicBreakdown) && previewData.topicBreakdown.length > 0 && (
            <div className="border border-slate-200 rounded max-h-48 overflow-y-auto">
              <table className="w-full text-xs font-mono">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                  <tr className="text-left">
                    <th className="px-3 py-1.5 font-semibold">Topic Heading</th>
                    <th className="px-3 py-1.5 font-semibold text-center">Total</th>
                    <th className="px-3 py-1.5 font-semibold text-center">Verified</th>
                    <th className="px-3 py-1.5 font-semibold text-center">Unanswered</th>
                    <th className="px-3 py-1.5 font-semibold text-center">Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewData.topicBreakdown.map((t: any) => (
                    <tr key={t.topicHeading}>
                      <td className="px-3 py-1.5 font-semibold text-slate-900">{t.topicHeading}</td>
                      <td className="px-3 py-1.5 text-center">{t.total}</td>
                      <td className="px-3 py-1.5 text-center text-emerald-700 font-bold">{t.verified}</td>
                      <td className="px-3 py-1.5 text-center text-slate-600">{t.unansweredInSource}</td>
                      <td className="px-3 py-1.5 text-center text-amber-700">{t.needsReview}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              onClick={() => setPreviewData(null)}
              className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleExecuteImport}
              disabled={isImporting || (!targetSubjectId && !newSubjectName.trim())}
              className="px-6 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded flex items-center gap-1.5 disabled:opacity-50"
            >
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Import {previewData.totalRecords} Questions to PostgreSQL
            </button>
          </div>
        </section>
      )}

      {/* IMPORT COMPLETION SCREEN */}
      {importResult && (
        <section className="bg-emerald-50 border-2 border-emerald-600 rounded-lg p-5 space-y-4 text-emerald-950 shadow-md">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0" />
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide">Import Complete</h2>
              <p className="text-xs text-emerald-800 mt-0.5">
                Successfully processed {importResult.totalProcessed} records into PostgreSQL.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs font-mono text-center">
            <div className="p-2.5 bg-white border border-emerald-200 rounded">
              <div className="text-slate-500 text-[10px]">Inserted</div>
              <div className="font-bold text-emerald-700 text-sm">{importResult.importedCount}</div>
            </div>
            <div className="p-2.5 bg-white border border-emerald-200 rounded">
              <div className="text-slate-500 text-[10px]">Duplicates</div>
              <div className="font-bold text-slate-800 text-sm">{importResult.duplicateCount}</div>
            </div>
            <div className="p-2.5 bg-white border border-blue-200 rounded">
              <div className="text-slate-500 text-[10px]">With Figures</div>
              <div className="font-bold text-blue-800 text-sm">{importResult.questionsWithFiguresCount ?? 0}</div>
            </div>
            <div className="p-2.5 bg-white border border-blue-200 rounded">
              <div className="text-slate-500 text-[10px]">Figures (New)</div>
              <div className="font-bold text-blue-700 text-sm">{importResult.figuresStoredCount ?? 0}</div>
            </div>
            <div className="p-2.5 bg-white border border-indigo-200 rounded">
              <div className="text-slate-500 text-[10px]">Figures (Reused)</div>
              <div className="font-bold text-indigo-700 text-sm">{importResult.figuresReusedCount ?? 0}</div>
            </div>
            <div className="p-2.5 bg-white border border-emerald-200 rounded">
              <div className="text-slate-500 text-[10px]">VERIFIED</div>
              <div className="font-bold text-emerald-700 text-sm">{importResult.verifiedCount}</div>
            </div>
          </div>

          {importResult.figuresRepairedCount > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded text-xs text-amber-900 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>{importResult.figuresRepairedCount} existing question(s)</strong> had missing figure links that were restored & repaired from this package.
              </span>
            </div>
          )}

          {importResult.missingFiguresCount > 0 && (
            <div className="p-3 bg-red-50 border border-red-300 rounded text-xs text-red-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-red-800">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span>{importResult.missingFiguresCount} Referenced Figure(s) Missing:</span>
              </div>
              <div className="max-h-28 overflow-y-auto space-y-1 pl-5">
                {importResult.missingFigures?.map((m: any, idx: number) => (
                  <div key={idx} className="font-mono text-[11px]">
                    • Question <span className="font-bold text-red-700">{m.questionId}</span>: reference <code className="bg-red-100 px-1 py-0.5 rounded">{m.reference}</code> not found in package
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={() => {
                setImportResult(null);
                setPreviewData(null);
                setUploadedFile(null);
                onImportComplete?.();
              }}
              className="px-5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded flex items-center gap-1.5 shadow"
            >
              View Question Bank <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}
    </div>
  );
};

