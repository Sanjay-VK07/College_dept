'use client';

import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Layers,
  Award,
  Hash,
} from 'lucide-react';
import { QuestionRenderer, getFormattedCorrectAnswer } from './QuestionRenderer';
import { SearchableSubjectSelect } from './SearchableSubjectSelect';

interface SubjectWiseAnswerKeyViewProps {
  questions: any[];
  subjects?: Array<{ id: string; name: string; code?: string }>;
  onZoomImage?: (url: string, title?: string) => void;
}

export const SubjectWiseAnswerKeyView: React.FC<SubjectWiseAnswerKeyViewProps> = ({
  questions = [],
  subjects = [],
  onZoomImage,
}) => {
  const [selectedSubject, setSelectedSubject] = useState<string>('ALL');
  const [selectedTopic, setSelectedTopic] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedVerification, setSelectedVerification] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [pageSize, setPageSize] = useState<number>(15);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Extract distinct subjects from questions data
  const subjectOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; code?: string }>();
    questions.forEach((q) => {
      const subj = q.subtopic?.topic?.module?.subject;
      if (subj && subj.name) {
        map.set(subj.id || subj.name, {
          id: subj.id || subj.name,
          name: subj.name,
          code: subj.code,
        });
      } else if (q.sourceChapter) {
        map.set(q.sourceChapter, {
          id: q.sourceChapter,
          name: q.sourceChapter,
          code: q.sourceChapter.slice(0, 4).toUpperCase(),
        });
      }
    });

    if (subjects && subjects.length > 0) {
      subjects.forEach((s) => {
        if (!map.has(s.id)) map.set(s.id, s);
      });
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [questions, subjects]);

  // Extract distinct topics filtered by the active subject
  const topicOptions = useMemo(() => {
    const set = new Set<string>();
    questions.forEach((q) => {
      const qSubj = q.subtopic?.topic?.module?.subject?.name || q.sourceChapter;
      const qSubjId = q.subtopic?.topic?.module?.subject?.id;
      if (selectedSubject !== 'ALL' && qSubj !== selectedSubject && qSubjId !== selectedSubject) {
        return;
      }
      const topicName = q.subtopic?.topic?.name || q.sourceSection;
      if (topicName) set.add(topicName);
    });
    return Array.from(set).sort();
  }, [questions, selectedSubject]);

  // Filtered Questions with stable ID-based mapping
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      const qSubjName = q.subtopic?.topic?.module?.subject?.name || q.sourceChapter || '';
      const qSubjId = q.subtopic?.topic?.module?.subject?.id || '';
      if (selectedSubject !== 'ALL' && qSubjName !== selectedSubject && qSubjId !== selectedSubject) {
        return false;
      }

      const qTopicName = q.subtopic?.topic?.name || q.sourceSection || '';
      if (selectedTopic !== 'ALL' && qTopicName !== selectedTopic) {
        return false;
      }

      if (selectedType !== 'ALL' && q.type !== selectedType) {
        return false;
      }

      if (selectedVerification !== 'ALL' && q.verificationStatus !== selectedVerification) {
        return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const customIdMatch = String(q.customId || '').toLowerCase().includes(query);
        const idMatch = String(q.id || '').toLowerCase().includes(query);
        const textMatch = String(q.text || '').toLowerCase().includes(query);
        const headingMatch = String(q.sourceHeading || '').toLowerCase().includes(query);
        const topicMatch = qTopicName.toLowerCase().includes(query);
        const subjMatch = qSubjName.toLowerCase().includes(query);
        if (!customIdMatch && !idMatch && !textMatch && !headingMatch && !topicMatch && !subjMatch) {
          return false;
        }
      }

      return true;
    });
  }, [questions, selectedSubject, selectedTopic, selectedType, selectedVerification, searchQuery]);

  // Pagination logic
  const totalItems = filteredQuestions.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (validCurrentPage - 1) * pageSize;
  const paginatedQuestions = filteredQuestions.slice(startIndex, startIndex + pageSize);

  // Subject Metrics
  const metrics = useMemo(() => {
    let mcqCount = 0;
    let msqCount = 0;
    let natCount = 0;
    let verifiedCount = 0;
    let totalMarks = 0;

    filteredQuestions.forEach((q) => {
      if (q.type === 'MCQ') mcqCount++;
      else if (q.type === 'MSQ') msqCount++;
      else if (q.type === 'NAT') natCount++;

      if (q.verificationStatus === 'VERIFIED') verifiedCount++;
      totalMarks += Number(q.marks || 1);
    });

    return { mcqCount, msqCount, natCount, verifiedCount, totalMarks };
  }, [filteredQuestions]);

  const handleResetFilters = () => {
    setSelectedSubject('ALL');
    setSelectedTopic('ALL');
    setSelectedType('ALL');
    setSelectedVerification('ALL');
    setSearchQuery('');
    setCurrentPage(1);
  };

  return (
    <div className="space-y-5 font-sans">
      {/* Top Filter and Search Controls */}
      <div className="erp-card bg-white border border-slate-200 p-5 space-y-4 shadow-xs rounded-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#1E40AF]" />
              Subject-wise Official Answer Key &amp; Question Review
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Inspect complete authentic GATE question stems, high-resolution source diagrams, verified official answers, and scoring criteria.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-mono">
              Showing <b>{paginatedQuestions.length}</b> of <b>{totalItems}</b> questions
            </span>
            {(selectedSubject !== 'ALL' || selectedTopic !== 'ALL' || selectedType !== 'ALL' || selectedVerification !== 'ALL' || searchQuery) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs text-blue-700 hover:text-blue-900 font-semibold px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 transition-colors"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Subject Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Subject</label>
            <SearchableSubjectSelect
              subjects={subjectOptions}
              value={selectedSubject}
              onChange={(val) => {
                setSelectedSubject(val);
                setSelectedTopic('ALL');
                setCurrentPage(1);
              }}
              allOptionLabel="All Subjects"
              placeholder="Search or Select Subject..."
            />
          </div>

          {/* Topic Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Topic</label>
            <select
              value={selectedTopic}
              onChange={(e) => {
                setSelectedTopic(e.target.value);
                setCurrentPage(1);
              }}
              className="erp-input py-1.5 text-xs w-full"
            >
              <option value="ALL">All Topics ({topicOptions.length})</option>
              {topicOptions.map((top) => (
                <option key={top} value={top}>
                  {top}
                </option>
              ))}
            </select>
          </div>

          {/* Question Type Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Question Type</label>
            <select
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value);
                setCurrentPage(1);
              }}
              className="erp-input py-1.5 text-xs w-full"
            >
              <option value="ALL">All Types (MCQ, MSQ, NAT)</option>
              <option value="MCQ">Multiple Choice (MCQ)</option>
              <option value="MSQ">Multiple Select (MSQ)</option>
              <option value="NAT">Numerical Answer (NAT)</option>
            </select>
          </div>

          {/* Verification Status Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Verification</label>
            <select
              value={selectedVerification}
              onChange={(e) => {
                setSelectedVerification(e.target.value);
                setCurrentPage(1);
              }}
              className="erp-input py-1.5 text-xs w-full"
            >
              <option value="ALL">All Verification Statuses</option>
              <option value="VERIFIED">Verified Only</option>
              <option value="NEEDS_REVIEW">Needs Review</option>
            </select>
          </div>

          {/* Search Query */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Search Keywords</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search ID, Code, Stem..."
                className="erp-input py-1.5 pl-8 text-xs w-full"
              />
            </div>
          </div>
        </div>

        {/* Diagnostic Metrics Pill Bar */}
        <div className="flex flex-wrap items-center gap-3 pt-2 text-xs font-mono">
          <div className="px-3 py-1 bg-blue-50 border border-blue-200 text-blue-900 rounded-md flex items-center gap-1.5">
            <span className="font-semibold text-blue-700">Total Filtered:</span>
            <b>{totalItems} Questions</b>
          </div>
          <div className="px-3 py-1 bg-slate-50 border border-slate-200 text-slate-700 rounded-md flex items-center gap-1.5">
            <span>MCQ:</span> <b>{metrics.mcqCount}</b>
            <span className="text-slate-300">•</span>
            <span>MSQ:</span> <b>{metrics.msqCount}</b>
            <span className="text-slate-300">•</span>
            <span>NAT:</span> <b>{metrics.natCount}</b>
          </div>
          <div className="px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Verified:</span> <b>{metrics.verifiedCount}</b>
          </div>
          <div className="px-3 py-1 bg-purple-50 border border-purple-200 text-purple-900 rounded-md flex items-center gap-1.5 ml-auto">
            <Award className="w-3.5 h-3.5 text-purple-600" />
            <span>Total Marks:</span> <b>{metrics.totalMarks}</b>
          </div>
        </div>
      </div>

      {/* Main Questions List: Always displays actual question and official answer together */}
      {paginatedQuestions.length === 0 ? (
        <div className="erp-card bg-white p-12 text-center text-slate-500 text-xs font-mono border border-slate-200 rounded-xl space-y-3">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
          <p className="font-bold text-slate-800 text-sm">No questions match the current filter selection.</p>
          <p className="text-slate-500">Try selecting a different subject or reset your search filters.</p>
          <button
            type="button"
            onClick={handleResetFilters}
            className="erp-btn-primary py-1.5 px-4 text-xs font-semibold"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {paginatedQuestions.map((q, idx) => {
            const absoluteIndex = startIndex + idx + 1;
            const formattedCa = getFormattedCorrectAnswer(q);
            const isVerified = q.verificationStatus === 'VERIFIED';
            const subjectName = q.subtopic?.topic?.module?.subject?.name || q.sourceChapter || 'General Subject';
            const topicName = q.subtopic?.topic?.name || q.sourceSection || 'General Topic';
            const qCode = q.customId || q.id.slice(0, 8);

            return (
              <div
                key={q.id || q.customId}
                id={`q-card-${q.id}`}
                className="erp-card bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xs hover:border-blue-300 transition-colors"
              >
                {/* Header Information Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                  <div className="flex items-center space-x-3 flex-wrap gap-y-1">
                    <span className="font-bold text-lg text-[#1E40AF]">Question {absoluteIndex}</span>
                    <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-blue-50 text-blue-800 font-bold border border-blue-200">
                      {qCode}
                    </span>
                    <span className="erp-badge-gray font-mono">{q.type}</span>
                    <span className="text-xs text-slate-500 font-medium">
                      {subjectName} → <b className="text-slate-700">{topicName}</b>
                    </span>
                    <span className="text-xs font-mono text-slate-600 flex items-center gap-2">
                      <span>Marks allotted: <b className="text-emerald-700">{q.marks === 2 ? '2 marks' : '1 mark'}</b></span>
                      <span className="text-slate-300">•</span>
                      {q.type === 'MCQ' ? (
                        <span>Negative marks deducted: <b className="text-rose-600">{q.negativeMarks ? `${q.negativeMarks} marks` : (q.marks === 2 ? '0.66 marks' : '0.33 marks')}</b></span>
                      ) : (
                        <span className="text-slate-500">Negative marks: <b className="text-slate-700">0.00 marks (No negative marking)</b></span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase border ${
                        isVerified
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : 'bg-amber-50 text-amber-800 border-amber-300'
                      }`}
                    >
                      {isVerified ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                      <span>{isVerified ? 'Verified' : 'Needs Review'}</span>
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono" title={q.id}>
                      UUID: {q.id.slice(0, 8)}...
                    </span>
                  </div>
                </div>

                {/* Question Body: High-resolution diagram/image and text */}
                <QuestionRenderer
                  question={q}
                  showCorrectAnswer={true}
                  onZoomImage={onZoomImage}
                  viewMode="QUESTION_BANK"
                  showInternalMetadata={false}
                />

                {/* Official Answer Key Box */}
                <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5 font-mono">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Official GATE Answer Key
                    </span>
                    <span className="text-[11px] font-mono font-semibold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded">
                      Standard Evaluation Key
                    </span>
                  </div>

                  <div className="text-base font-bold font-mono text-emerald-800 pt-1">
                    {formattedCa.isSet ? (
                      q.type === 'MCQ' ? (
                        <span>Correct Option: <b>{formattedCa.text}</b></span>
                      ) : q.type === 'MSQ' ? (
                        <span>Correct Combination: <b>{formattedCa.text}</b></span>
                      ) : (
                        <span>Accepted Value / Range: <b>{formattedCa.text}</b></span>
                      )
                    ) : (
                      <span className="text-amber-800 bg-amber-100 px-2 py-0.5 rounded text-xs">
                        Answer Key Pending Verification
                      </span>
                    )}
                  </div>

                  {q.type === 'NAT' && (
                    <p className="text-[11px] text-emerald-700 font-sans">
                      Numerical answers within official accepted tolerance or bounds receive full credit. No negative marks apply to NAT questions.
                    </p>
                  )}
                </div>

                {/* Explanation & Source Reference */}
                {(q.explanation || q.reference || q.sourcePage || q.previousYear) && (
                  <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-lg space-y-2 text-xs">
                    <div className="font-bold text-[#1E40AF] flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-blue-600" />
                      Concept Explanation &amp; Source Attribution
                    </div>
                    {q.explanation && (
                      <p className="text-slate-700 leading-relaxed font-sans">{q.explanation}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] font-mono text-slate-500">
                      {q.previousYear && <span>Exam: <b>{q.previousYear}</b></span>}
                      {q.sourcePage && <span>Source Page: <b>Pg {q.sourcePage}</b></span>}
                      {q.sourceChapter && <span>Volume Chapter: <b>{q.sourceChapter}</b></span>}
                      {q.reference && <span>Reference: <b>{q.reference}</b></span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="erp-card bg-white border border-slate-200 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2 text-xs text-slate-600 font-mono">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="erp-input py-1 px-2 text-xs"
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span>
              Showing {startIndex + 1}–{Math.min(startIndex + pageSize, totalItems)} of {totalItems} questions
            </span>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={validCurrentPage <= 1}
              className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-3 py-1 font-mono text-xs font-semibold text-slate-700">
              Page {validCurrentPage} of {totalPages}
            </div>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={validCurrentPage >= totalPages}
              className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
