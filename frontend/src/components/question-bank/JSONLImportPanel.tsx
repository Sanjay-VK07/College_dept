'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  CheckCircle2,
  CheckCircle,
  AlertCircle,
  X,
  Loader2,
  ArrowRight,
  UploadCloud,
  AlertTriangle,
  Image as ImageIcon,
  FileArchive,
  BookOpen,
  PlusCircle,
} from 'lucide-react';
import { aiService } from '@/services/aiService';
import { SearchableSubjectSelect, SubjectOption } from './SearchableSubjectSelect';

interface JSONLImportPanelProps {
  onImportComplete?: () => void;
}

export const JSONLImportPanel: React.FC<JSONLImportPanelProps> = ({ onImportComplete }) => {
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [importResult, setImportResult] = useState<any | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Subject Selection / Creation State
  const [subjectMode, setSubjectMode] = useState<'SELECT' | 'CREATE'>('SELECT');
  const [targetSubjectId, setTargetSubjectId] = useState<string>('');
  const [newSubjectName, setNewSubjectName] = useState<string>('');
  const [newSubjectCode, setNewSubjectCode] = useState<string>('');
  const [newDepartment, setNewDepartment] = useState<string>('CSE');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadSubjects = () => {
    aiService
      .getQuestionBankSubjects()
      .then((res) => {
        if (res?.success) {
          const list: SubjectOption[] = res.data || [];
          setSubjects(list);
          // Auto-select Computer Networks or Computer Organization if not already selected
          if (!targetSubjectId && list.length > 0) {
            const defaultSubj =
              list.find((s) => s.name?.toLowerCase().includes('computer network')) ||
              list.find((s) => s.code?.includes('COA') || s.name?.toLowerCase().includes('computer')) ||
              list[0];
            if (defaultSubj) {
              setTargetSubjectId(defaultSubj.id);
            }
          }
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadSubjects();
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

    if (subjectMode === 'SELECT' && !targetSubjectId) {
      setErrorMsg('Please select a target subject.');
      return;
    }
    if (subjectMode === 'CREATE' && !newSubjectName.trim()) {
      setErrorMsg('Please enter a subject name for creation.');
      return;
    }

    setErrorMsg(null);
    setIsImporting(true);

    try {
      const target =
        subjectMode === 'SELECT'
          ? {
              subjectId: targetSubjectId,
              moduleName: previewData?.chapterName,
            }
          : {
              subjectName: newSubjectName.trim(),
              subjectCode: newSubjectCode.trim() || undefined,
              department: newDepartment.trim() || 'CSE',
              moduleName: previewData?.chapterName,
            };

      const res = await aiService.importJSONL(uploadedFile!, target);
      if (res?.success) {
        setImportResult(res.data);
        // Refresh subjects list so newly created subjects appear in state
        loadSubjects();
      } else {
        setErrorMsg(res?.message || 'Question Bank Import failed.');
      }
    } catch (e: any) {
      setErrorMsg(e.response?.data?.message || 'Question Bank Import failed.');
    } finally {
      setIsImporting(false);
    }
  };

  // Derive target subject summary display metadata
  const selectedSubject = subjects.find((s) => s.id === targetSubjectId);
  const matchedExisting = newSubjectName.trim()
    ? subjects.find((s) => s.name.trim().toLowerCase() === newSubjectName.trim().toLowerCase())
    : null;

  const targetSubjectDisplayName =
    subjectMode === 'SELECT'
      ? selectedSubject?.name || 'No subject selected'
      : matchedExisting
      ? matchedExisting.name
      : newSubjectName.trim() || 'Pending Subject Name';

  const targetSubjectDisplayCode =
    subjectMode === 'SELECT'
      ? selectedSubject?.code || (selectedSubject?.id ? `${selectedSubject.id.slice(0, 10)}...` : '—')
      : matchedExisting
      ? `${matchedExisting.code || matchedExisting.id.slice(0, 10)} (Reusing existing)`
      : newSubjectCode.trim() || 'Auto-generated code';

  const chapterDisplayName = previewData?.chapterName || 'Chapter 1';

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

      {/* UPLOAD DROPZONE */}
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
                <span className="mx-2">•</span>
                Chapter: <span className="font-bold text-emerald-700">{chapterDisplayName}</span>
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

          {/* TARGET SUBJECT SELECTION / ENTRY COMPONENT */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Subject <span className="text-red-600">*</span>
              </span>
              <div className="inline-flex rounded-md shadow-sm bg-slate-200/90 p-0.5" role="group">
                <button
                  type="button"
                  onClick={() => setSubjectMode('SELECT')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                    subjectMode === 'SELECT'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Select existing subject ▾
                </button>
                <button
                  type="button"
                  onClick={() => setSubjectMode('CREATE')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded transition-all flex items-center gap-1 ${
                    subjectMode === 'CREATE'
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  + Create new subject
                </button>
              </div>
            </div>

            {subjectMode === 'SELECT' ? (
              <div className="space-y-1.5">
                <SearchableSubjectSelect
                  subjects={subjects}
                  value={targetSubjectId}
                  onChange={(id) => setTargetSubjectId(id)}
                  placeholder="Type to search existing subjects..."
                  className="w-full"
                />
                <p className="text-[11px] text-slate-500">
                  Search by subject name. Displays subject name prominently with its code as secondary metadata.
                </p>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Subject Name <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={newSubjectName}
                      onChange={(e) => setNewSubjectName(e.target.value)}
                      placeholder="e.g. Computer Networks"
                      className="w-full p-2 border border-slate-300 rounded text-xs bg-white font-medium focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Subject Code <span className="text-slate-400 font-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={newSubjectCode}
                      onChange={(e) => setNewSubjectCode(e.target.value)}
                      placeholder="e.g. CS_CN"
                      className="w-full p-2 border border-slate-300 rounded text-xs bg-white font-mono uppercase focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-slate-500 bg-white p-2.5 rounded border border-slate-200">
                  <span>
                    Department: <strong className="text-slate-800 font-mono">{newDepartment}</strong> (default)
                  </span>
                  {matchedExisting ? (
                    <span className="text-emerald-700 font-semibold">
                      ✓ Matches existing subject "{matchedExisting.name}" ({matchedExisting.code}) — will reuse without duplicate.
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">
                      Normalized matching (case-insensitive) prevents creating duplicate subjects.
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Core Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-2.5 text-xs font-mono text-center">
            <div className="p-2.5 bg-slate-50 border rounded">
              <div className="text-slate-500 text-[10px]">Total Records</div>
              <div className="font-bold text-slate-900 text-sm mt-0.5">{previewData.totalRecords ?? 0}</div>
            </div>
            <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded">
              <div className="text-emerald-700 text-[10px] font-bold">Valid (Ready)</div>
              <div className="font-bold text-emerald-900 text-sm mt-0.5">{previewData.validCount ?? 0}</div>
            </div>
            <div className={`p-2.5 border rounded ${previewData.invalidCount > 0 ? 'bg-red-50 border-red-300 text-red-900' : 'bg-slate-50 text-slate-700'}`}>
              <div className="text-[10px] font-bold">Invalid Records</div>
              <div className="font-bold text-sm mt-0.5">{previewData.invalidCount ?? 0}</div>
            </div>
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded">
              <div className="text-blue-700 text-[10px] flex items-center justify-center gap-1">
                <ImageIcon className="w-3 h-3" /> Questions w/ Figs
              </div>
              <div className="font-bold text-blue-900 text-sm mt-0.5">{previewData.questionsWithFigures ?? 0}</div>
            </div>
            <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded">
              <div className="text-indigo-700 text-[10px]">Figure Assets</div>
              <div className="font-bold text-indigo-900 text-sm mt-0.5">{previewData.figureAssetsFoundCount ?? 0}</div>
            </div>
            <div className={`p-2.5 border rounded ${previewData.missingFiguresCount > 0 ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-slate-50'}`}>
              <div className="text-slate-500 text-[10px]">Missing Figures</div>
              <div className="font-bold text-sm mt-0.5">{previewData.missingFiguresCount ?? 0}</div>
            </div>
            <div className="p-2.5 bg-slate-50 border rounded">
              <div className="text-slate-500 text-[10px]">Duplicates</div>
              <div className="font-bold text-slate-900 text-sm mt-0.5">{previewData.duplicateCount ?? 0}</div>
            </div>
          </div>

          {/* Invalid Records Error Details (if any) */}
          {Array.isArray(previewData.invalidRecords) && previewData.invalidRecords.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-red-900 text-xs space-y-1.5">
              <div className="font-bold flex items-center gap-1.5 text-red-800">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span>Invalid Records ({previewData.invalidRecords.length}) — Will be skipped during import:</span>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1 font-mono text-[11px] bg-white/80 p-2 rounded border border-red-200">
                {previewData.invalidRecords.map((inv: any, idx: number) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-red-700 font-bold">Line {inv.line}:</span>
                    <span className="bg-red-100 text-red-800 px-1 rounded text-[10px] font-bold">{inv.code || 'INVALID'}</span>
                    {inv.questionId && <span>[{inv.questionId}]</span>}
                    <span className="text-slate-700">{inv.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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

          {/* PRE-IMPORT SUMMARY CARD */}
          <div className="bg-slate-900 text-white rounded-lg p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Target Subject</span>
                <span className="font-bold text-white text-sm">{targetSubjectDisplayName}</span>
              </div>
              <div className="border-l border-slate-700 pl-4">
                <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Subject ID / Code</span>
                <span className="font-mono text-emerald-400 font-semibold">{targetSubjectDisplayCode}</span>
              </div>
              <div className="border-l border-slate-700 pl-4">
                <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Chapter</span>
                <span className="font-bold text-sky-300 font-mono">{chapterDisplayName}</span>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 sm:text-right">
              Ready to import <strong className="text-emerald-400">{previewData.validCount ?? 0}</strong> valid questions
              {previewData.invalidCount > 0 && <span className="text-red-300 block text-[10px]">({previewData.invalidCount} invalid skipped)</span>}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
            <button
              onClick={() => setPreviewData(null)}
              className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleExecuteImport}
              disabled={
                isImporting ||
                !previewData.validCount ||
                previewData.validCount === 0 ||
                (subjectMode === 'SELECT' && !targetSubjectId) ||
                (subjectMode === 'CREATE' && !newSubjectName.trim())
              }
              className="px-6 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Import {previewData.validCount ?? 0} Questions to PostgreSQL
            </button>
          </div>
        </section>
      )}

      {/* POST-IMPORT SUMMARY SCREEN */}
      {importResult && (
        <section className="bg-emerald-50 border-2 border-emerald-600 rounded-lg p-5 space-y-4 text-emerald-950 shadow-md">
          <div className="flex items-center justify-between border-b border-emerald-200 pb-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0" />
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wide">Import Complete</h2>
                <p className="text-xs text-emerald-800 mt-0.5">
                  Successfully imported dataset into Question Bank.
                </p>
              </div>
            </div>
          </div>

          {/* Post-Import Target Card */}
          <div className="bg-white border border-emerald-300 rounded-lg p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-slate-500 text-[10px] uppercase tracking-wider font-bold block">Subject</span>
              <span className="font-bold text-slate-900 text-sm">{importResult.subjectName || targetSubjectDisplayName}</span>
              {importResult.subjectCode && (
                <span className="text-[10px] text-slate-500 font-mono block mt-0.5">Code: {importResult.subjectCode}</span>
              )}
            </div>
            <div>
              <span className="text-slate-500 text-[10px] uppercase tracking-wider font-bold block">Chapter</span>
              <span className="font-bold text-emerald-800 font-mono text-sm">{importResult.moduleName || chapterDisplayName}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] uppercase tracking-wider font-bold block">Package File</span>
              <span className="font-mono text-slate-700 truncate block text-xs mt-0.5">{importResult.fileName}</span>
            </div>
          </div>

          {/* Core Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-xs font-mono text-center">
            <div className="p-2.5 bg-white border border-emerald-200 rounded shadow-sm">
              <div className="text-slate-500 text-[10px]">Inserted</div>
              <div className="font-bold text-emerald-700 text-sm">{importResult.importedCount}</div>
            </div>
            <div className="p-2.5 bg-white border border-slate-200 rounded shadow-sm">
              <div className="text-slate-500 text-[10px]">Duplicates</div>
              <div className="font-bold text-slate-800 text-sm">{importResult.duplicateCount}</div>
            </div>
            <div className="p-2.5 bg-white border border-blue-200 rounded shadow-sm">
              <div className="text-blue-700 text-[10px]">Questions w/ Figures</div>
              <div className="font-bold text-blue-700 text-sm">{importResult.questionsWithFiguresCount ?? 0}</div>
            </div>
            <div className="p-2.5 bg-white border border-indigo-200 rounded shadow-sm">
              <div className="text-indigo-700 text-[10px]">Figure Assets (New)</div>
              <div className="font-bold text-indigo-700 text-sm">{importResult.figuresStoredCount ?? 0}</div>
            </div>
            <div className="p-2.5 bg-white border border-sky-200 rounded shadow-sm">
              <div className="text-sky-700 text-[10px]">Figure Assets (Reused)</div>
              <div className="font-bold text-sky-700 text-sm">{importResult.figuresReusedCount ?? 0}</div>
            </div>
            <div className="p-2.5 bg-white border border-amber-200 rounded shadow-sm">
              <div className="text-amber-700 text-[10px]">Figure Assets (Repaired)</div>
              <div className="font-bold text-amber-700 text-sm">{importResult.figuresRepairedCount ?? 0}</div>
            </div>
            <div className={`p-2.5 bg-white border rounded shadow-sm ${importResult.missingFiguresCount > 0 ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`}>
              <div className="text-slate-500 text-[10px]">Missing Figures</div>
              <div className={`font-bold text-sm ${importResult.missingFiguresCount > 0 ? 'text-amber-800' : 'text-slate-800'}`}>
                {importResult.missingFiguresCount ?? 0}
              </div>
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
