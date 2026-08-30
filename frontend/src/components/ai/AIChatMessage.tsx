'use client';

import React, { useState, useEffect } from 'react';
import { Bot, User, ThumbsUp, ThumbsDown, Check, FileSpreadsheet, Download, Loader2, AlertCircle } from 'lucide-react';
import { AIMessage, aiService } from '@/services/aiService';

interface AIChatMessageProps {
  message: AIMessage;
}

export const AIChatMessage: React.FC<AIChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'USER';

  const [rating, setRating] = useState<'HELPFUL' | 'NOT_HELPFUL' | null>(null);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<
    'INCORRECT' | 'NOT_RELEVANT' | 'INSUFFICIENT_CONTEXT' | 'GOOD_ANSWER' | 'OTHER' | undefined
  >(undefined);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Excel Export Action State
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const actionFromContent = React.useMemo(() => {
    if (message.action) return message.action;
    if (message.content && message.content.includes('<!--action:')) {
      const match = message.content.match(/<!--action:([\s\S]*?)-->/);
      if (match) {
        try {
          return JSON.parse(match[1]);
        } catch (e) {}
      }
    }
    return undefined;
  }, [message.action, message.content]);

  const activeAction = message.action || actionFromContent;
  const isExcelAction = !isUser && activeAction?.type === 'DOWNLOAD_STUDENT_EXCEL';

  const handleDownloadExcel = async () => {
    if (downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await aiService.downloadStudentDataExcel(
        activeAction?.downloadUrl,
        activeAction?.fileName
      );
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4000);
    } catch (err: any) {
      console.error('Download failed:', err);
      setDownloadError(err.response?.data?.message || err.message || 'Download failed. Please check permissions and try again.');
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    if (!isUser && message.id) {
      aiService
        .getFeedback(message.id)
        .then((res) => {
          if (res?.data) {
            setRating(res.data.rating);
            setSelectedCategory(res.data.category);
            setFeedbackSubmitted(true);
          }
        })
        .catch(() => {});
    }
  }, [message.id, isUser]);

  const handleRatingClick = async (newRating: 'HELPFUL' | 'NOT_HELPFUL') => {
    if (submitting) return;
    setRating(newRating);
    setShowCategoryMenu(true);

    try {
      setSubmitting(true);
      await aiService.submitFeedback(message.id, {
        rating: newRating,
        category: newRating === 'HELPFUL' ? 'GOOD_ANSWER' : 'NOT_RELEVANT',
      });
      setFeedbackSubmitted(true);
    } catch (err) {
      console.error('Failed to submit feedback:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCategorySelect = async (
    category: 'INCORRECT' | 'NOT_RELEVANT' | 'INSUFFICIENT_CONTEXT' | 'GOOD_ANSWER' | 'OTHER'
  ) => {
    if (!rating || submitting) return;
    setSelectedCategory(category);
    setShowCategoryMenu(false);

    try {
      setSubmitting(true);
      await aiService.submitFeedback(message.id, {
        rating,
        category,
      });
      setFeedbackSubmitted(true);
    } catch (err) {
      console.error('Failed to update feedback category:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Basic renderer for bullet lists, bold text, and lines
  const renderFormattedContent = (content: string) => {
    const cleanContent = content.replace(/<!--action:[\s\S]*?-->/g, '').trim();
    const lines = cleanContent.split('\n');
    return lines.map((line, idx) => {
      if (line.startsWith('### ')) {
        return <h4 key={idx} className="font-semibold text-sm mt-2 mb-1 text-slate-900">{line.replace('### ', '')}</h4>;
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return (
          <li key={idx} className="ml-4 list-disc text-xs sm:text-sm my-0.5">
            {line.substring(2)}
          </li>
        );
      }
      if (line.trim() === '') {
        return <div key={idx} className="h-1.5" />;
      }
      return (
        <p key={idx} className="text-xs sm:text-sm leading-relaxed my-0.5">
          {line}
        </p>
      );
    });
  };

  return (
    <div className={`flex w-full my-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[85%] ${isUser ? 'flex-row-reverse space-x-reverse space-x-2' : 'flex-row space-x-2'}`}>
        {/* Avatar */}
        <div
          className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs mt-0.5 ${
            isUser ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700 border border-slate-300'
          }`}
        >
          {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4 text-blue-700" />}
        </div>

        {/* Message Content Bubble */}
        <div className="flex flex-col">
          <div
            className={`p-3 rounded-xl text-xs sm:text-sm shadow-sm ${
              isUser
                ? 'bg-[#1E40AF] text-white rounded-tr-none'
                : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
            }`}
          >
            {renderFormattedContent(message.content)}

            {/* Structured Action: Download Student Data Excel Button */}
            {isExcelAction && (
              <div className="mt-3 pt-2.5 border-t border-slate-100">
                <div className="flex flex-col space-y-1.5">
                  <button
                    type="button"
                    onClick={handleDownloadExcel}
                    disabled={downloading}
                    className={`inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer ${
                      downloadSuccess
                        ? 'bg-emerald-700 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white'
                    } disabled:opacity-60 disabled:cursor-not-allowed`}
                  >
                    {downloading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Preparing Excel...</span>
                      </>
                    ) : downloadSuccess ? (
                      <>
                        <Check className="w-4 h-4 text-white" />
                        <span>Downloaded ({activeAction?.fileName || 'Excel file'})</span>
                      </>
                    ) : (
                      <>
                        <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
                        <span>Download Excel</span>
                        <Download className="w-3.5 h-3.5 text-emerald-200 ml-0.5" />
                      </>
                    )}
                  </button>

                  {activeAction?.fileName && !downloadSuccess && (
                    <span className="text-[10px] text-slate-400 font-mono text-center">
                      📄 {activeAction.fileName}
                    </span>
                  )}

                  {downloadError && (
                    <div className="flex items-center space-x-1 text-[11px] text-red-600 bg-red-50 p-1.5 rounded border border-red-200 mt-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{downloadError}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Source Citations UI */}
            {message.sources && message.sources.length > 0 && (
              <div className="mt-2.5 pt-2 border-t border-slate-100 text-[11px]">
                <span className="font-medium text-slate-500 block mb-1">Sources Cited:</span>
                <div className="flex flex-wrap gap-1">
                  {message.sources.map((src, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-100 font-mono text-[10px]"
                    >
                      📄 {src.title}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div
              className={`text-[10px] mt-1 text-right ${
                isUser ? 'text-blue-200' : 'text-slate-400'
              }`}
            >
              {message.createdAt
                ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : ''}
            </div>
          </div>

          {/* Feedback UI Controls for Assistant Messages */}
          {!isUser && (
            <div className="flex items-center space-x-2 mt-1 ml-1 text-slate-400">
              <button
                type="button"
                onClick={() => handleRatingClick('HELPFUL')}
                title="Helpful"
                className={`p-1 rounded hover:bg-slate-100 transition-colors ${
                  rating === 'HELPFUL' ? 'text-green-600 font-bold bg-green-50' : 'hover:text-slate-600'
                }`}
              >
                <ThumbsUp className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => handleRatingClick('NOT_HELPFUL')}
                title="Not Helpful"
                className={`p-1 rounded hover:bg-slate-100 transition-colors ${
                  rating === 'NOT_HELPFUL' ? 'text-red-600 font-bold bg-red-50' : 'hover:text-slate-600'
                }`}
              >
                <ThumbsDown className="w-3.5 h-3.5" />
              </button>

              {feedbackSubmitted && (
                <span className="text-[10px] text-green-600 flex items-center space-x-0.5">
                  <Check className="w-3 h-3" />
                  <span>Feedback saved</span>
                </span>
              )}

              {/* Reason Category Quick Picker */}
              {showCategoryMenu && (
                <div className="flex flex-wrap gap-1 mt-1 text-[10px]">
                  {rating === 'HELPFUL' ? (
                    <button
                      onClick={() => handleCategorySelect('GOOD_ANSWER')}
                      className={`px-1.5 py-0.5 rounded border ${
                        selectedCategory === 'GOOD_ANSWER'
                          ? 'bg-blue-100 text-blue-800 border-blue-300'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      Good Answer
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleCategorySelect('INCORRECT')}
                        className={`px-1.5 py-0.5 rounded border ${
                          selectedCategory === 'INCORRECT'
                            ? 'bg-red-100 text-red-800 border-red-300'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        Incorrect
                      </button>
                      <button
                        onClick={() => handleCategorySelect('NOT_RELEVANT')}
                        className={`px-1.5 py-0.5 rounded border ${
                          selectedCategory === 'NOT_RELEVANT'
                            ? 'bg-red-100 text-red-800 border-red-300'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        Not Relevant
                      </button>
                      <button
                        onClick={() => handleCategorySelect('INSUFFICIENT_CONTEXT')}
                        className={`px-1.5 py-0.5 rounded border ${
                          selectedCategory === 'INSUFFICIENT_CONTEXT'
                            ? 'bg-red-100 text-red-800 border-red-300'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        Needs Context
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
