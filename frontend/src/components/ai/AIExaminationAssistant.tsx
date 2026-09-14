'use client';

import React, { useState, useEffect, useRef } from 'react';
import { aiService, AIMessage, AIConversationSummary } from '@/services/aiService';
import {
  Bot,
  Send,
  Plus,
  Trash2,
  Edit2,
  Loader2,
  Sparkles,
  BookOpen,
  Check,
  AlertCircle,
  FileText,
  CheckCircle2,
  HelpCircle,
  ArrowRight,
  BarChart2,
  User,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Download,
} from 'lucide-react';

interface AIExaminationAssistantProps {
  role?: string; // STUDENT, FACULTY, ADMIN
}

export const AIExaminationAssistant: React.FC<AIExaminationAssistantProps> = ({ role = 'STUDENT' }) => {
  // Tabs: 'chat' (all roles), 'practice' (student), 'insights' (student). Exam authoring
  // (formerly a 'generator' tab here) now lives entirely in Question Bank.
  const [activeTab, setActiveTab] = useState<'chat' | 'practice' | 'insights'>('chat');

  // Conversational state
  const [conversations, setConversations] = useState<AIConversationSummary[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [streamingStatus, setStreamingStatus] = useState<string | null>(null);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Excel Export Action State
  const [downloadingExcelMsgId, setDownloadingExcelMsgId] = useState<string | null>(null);
  const [downloadSuccessMsgId, setDownloadSuccessMsgId] = useState<string | null>(null);
  const [downloadExcelError, setDownloadExcelError] = useState<{ msgId: string; error: string } | null>(null);

  const handleDownloadExcelAction = async (msg: AIMessage) => {
    if (downloadingExcelMsgId) return;
    setDownloadingExcelMsgId(msg.id);
    setDownloadExcelError(null);
    try {
      await aiService.downloadStudentDataExcel(
        msg.action?.downloadUrl,
        msg.action?.fileName
      );
      setDownloadSuccessMsgId(msg.id);
      setTimeout(() => setDownloadSuccessMsgId(null), 4000);
    } catch (err: any) {
      console.error('Download failed:', err);
      setDownloadExcelError({
        msgId: msg.id,
        error: err.response?.data?.message || err.message || 'Download failed. Please check permissions and try again.',
      });
    } finally {
      setDownloadingExcelMsgId(null);
    }
  };

  // RAG references for current message or conversation
  const [citations, setCitations] = useState<any[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Practice Mode State (Student)
  const [practiceSubject, setPracticeSubject] = useState('');
  const [practiceTopic, setPracticeTopic] = useState('');
  const [practiceDifficulty, setPracticeDifficulty] = useState('MEDIUM');
  const [practiceCount, setPracticeCount] = useState(5);
  const [practiceSet, setPracticeSet] = useState<any>(null);
  const [studentAnswers, setStudentAnswers] = useState<string[]>([]);
  const [practiceResult, setPracticeResult] = useState<any>(null);
  const [isGeneratingPractice, setIsGeneratingPractice] = useState(false);
  const [practiceAttempts, setPracticeAttempts] = useState<any[]>([]);
  const [activeAttemptDetail, setActiveAttemptDetail] = useState<any | null>(null);

  // Performance Insights (Student)
  const [insights, setInsights] = useState<any>(null);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);

  // Load basic lists
  useEffect(() => {
    fetchConversations();
    if (role === 'STUDENT') {
      fetchPracticeAttempts();
      fetchInsights();
    }
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [role]);

  // Scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoadingChat]);

  const fetchConversations = async () => {
    try {
      const list = await aiService.getConversations();
      setConversations(list || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPracticeAttempts = async () => {
    try {
      const res = await aiService.getPracticeAttempts();
      if (res.success) {
        setPracticeAttempts(res.data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchInsights = async () => {
    setIsLoadingInsights(true);
    try {
      const res = await aiService.getPerformanceInsights();
      if (res.success) {
        setInsights(res.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingInsights(false);
    }
  };

  // Chat Actions
  const startNewChat = () => {
    setCurrentConversationId(undefined);
    setMessages([]);
    setCitations([]);
  };

  const selectConversation = async (convId: string) => {
    try {
      setIsLoadingChat(true);
      const data = await aiService.getConversation(convId);
      setCurrentConversationId(data.id);
      setMessages(data.messages || []);
      setCitations([]); // reset citations on load
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingChat(false);
    }
  };

  const handleRenameConversation = async (convId: string) => {
    if (!editingTitle.trim()) return;
    try {
      await aiService.renameConversation(convId, editingTitle.trim());
      setEditingConvId(null);
      fetchConversations();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteConversation = async (convId: string) => {
    if (!confirm('Are you sure you want to delete this conversation?')) return;
    try {
      await aiService.deleteConversation(convId);
      if (currentConversationId === convId) {
        startNewChat();
      }
      fetchConversations();
    } catch (e) {
      console.error(e);
    }
  };

  const handleStopChat = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoadingChat(false);
    setStreamingStatus(null);
  };

  const handleSendChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isLoadingChat) return;

    const text = inputText.trim();
    setInputText('');

    const userMsgId = 'user-' + Date.now();
    const tempAssistantId = 'assistant-' + Date.now();

    const userMsg: AIMessage = {
      id: userMsgId,
      role: 'USER',
      content: text,
      createdAt: new Date().toISOString(),
    };

    const tempAssistantMsg: AIMessage = {
      id: tempAssistantId,
      role: 'ASSISTANT',
      content: '',
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg, tempAssistantMsg]);
    setIsLoadingChat(true);
    setStreamingStatus('Searching knowledge base...');

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      await aiService.sendStreamMessage(
        text,
        currentConversationId,
        (data) => {
          if (data.conversationId) {
            setCurrentConversationId(data.conversationId);
            fetchConversations();
          }
          setStreamingStatus('Preparing response...');
        },
        (queuedData) => {
          setStreamingStatus(`AI is busy. Waiting in queue... Position: ${queuedData.position}`);
        },
        (token) => {
          setStreamingStatus(null);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === tempAssistantId ? { ...msg, content: msg.content + token } : msg
            )
          );
        },
        (data) => {
          if (data.sources && data.sources.length > 0) {
            setCitations(data.sources);
          }
          if (data.messageId) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === tempAssistantId
                  ? { ...msg, id: data.messageId, action: data.action }
                  : msg
              )
            );
          }
          setIsLoadingChat(false);
          setStreamingStatus(null);
        },
        (error) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === tempAssistantId && !msg.content
                ? { ...msg, content: error.message || 'An error occurred during response generation.' }
                : msg
            )
          );
          setIsLoadingChat(false);
          setStreamingStatus(null);
        },
        abortController.signal
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('[Streaming Error]:', err);
      }
    } finally {
      setIsLoadingChat(false);
      setStreamingStatus(null);
      abortControllerRef.current = null;
    }
  };

  // Student Practice Quiz Actions
  const handleGeneratePractice = async () => {
    if (!practiceSubject || !practiceTopic) {
      alert('Please specify a Subject and Topic.');
      return;
    }
    setIsGeneratingPractice(true);
    setPracticeResult(null);
    try {
      const res = await aiService.generatePracticeSet({
        subject: practiceSubject,
        topic: practiceTopic,
        difficulty: practiceDifficulty,
        count: practiceCount,
      });
      if (res.success) {
        setPracticeSet(res.data);
        setStudentAnswers(new Array(res.data.questions.length).fill(''));
      } else {
        alert(res.message || 'Failed to generate practice quiz.');
      }
    } catch (e: any) {
      alert(e.response?.data?.message || 'Error generating practice quiz.');
    } finally {
      setIsGeneratingPractice(false);
    }
  };

  const handleSubmitPractice = async () => {
    if (!practiceSet) return;
    try {
      const res = await aiService.submitPracticeSet({
        subject: practiceSet.subject,
        topic: practiceSet.topic,
        difficulty: practiceSet.difficulty,
        questions: practiceSet.questions,
        answers: studentAnswers,
      });
      if (res.success) {
        setPracticeResult(res.data);
        fetchPracticeAttempts();
        fetchInsights();
      } else {
        alert(res.message || 'Evaluation failed.');
      }
    } catch (e) {
      alert('Error submitting practice set.');
    }
  };

  return (
    <div className="flex h-[750px] border rounded-2xl overflow-hidden shadow-2xl font-sans bg-slate-900 border-slate-700/60 text-slate-100">
      {/* Sidebar Conversation Browser */}
      <div className="hidden md:flex w-80 bg-slate-950 border-r border-slate-800 flex-col justify-between">
        <div>
          <div className="p-4 border-b border-slate-850 flex items-center justify-between">
            <span className="flex items-center space-x-2 text-sm font-semibold text-blue-400">
              <Bot className="w-5 h-5 text-blue-400" />
              <span>AI Examination Assistant</span>
            </span>
            <button
              onClick={startNewChat}
              className="p-1.5 rounded-lg bg-blue-600/25 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 transition-all cursor-pointer"
              title="Start New Conversation"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 overflow-y-auto max-h-[500px] space-y-2">
            <h5 className="text-xs uppercase text-slate-500 font-semibold px-2">Conversations</h5>
            {conversations.length === 0 ? (
              <div className="p-4 text-xs text-slate-600 text-center">No past consultations.</div>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  className={`group relative flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                    currentConversationId === c.id
                      ? 'bg-slate-850 border-slate-750 text-blue-400'
                      : 'bg-transparent border-transparent hover:bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-6" onClick={() => selectConversation(c.id)}>
                    {editingConvId === c.id ? (
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={() => handleRenameConversation(c.id)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRenameConversation(c.id)}
                        className="bg-slate-900 text-slate-100 p-1 w-full rounded border border-blue-600 focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      <div className="truncate font-medium">{c.title || 'AI Consultation'}</div>
                    )}
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {new Date(c.updatedAt).toLocaleDateString()}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="absolute right-2 top-2.5 hidden group-hover:flex items-center space-x-1">
                    <button
                      onClick={() => {
                        setEditingConvId(c.id);
                        setEditingTitle(c.title || '');
                      }}
                      className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteConversation(c.id)}
                      className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* User Info / Role Footer */}
        <div className="p-4 border-t border-slate-850 bg-slate-950/80 flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-blue-400">
            <User className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate text-slate-200">GSMAS Member</div>
            <div className="text-[10px] text-blue-500 font-bold uppercase">{role} Portal</div>
          </div>
        </div>
      </div>

      {/* Main Panel Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-900">
        {/* Mode Tabs */}
        <div className="flex px-6 py-2 border-b bg-slate-950 border-slate-800">
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-all ${
              activeTab === 'chat'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Chat & RAG Assistant
          </button>

          {role === 'STUDENT' && (
            <>
              <button
                onClick={() => setActiveTab('practice')}
                className={`px-4 py-2 text-xs font-medium border-b-2 transition-all ${
                  activeTab === 'practice'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Practice Quiz Mode
              </button>
              <button
                onClick={() => setActiveTab('insights')}
                className={`px-4 py-2 text-xs font-medium border-b-2 transition-all ${
                  activeTab === 'insights'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Performance Insights
              </button>
            </>
          )}
        </div>

        {/* Tab Layouts */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: Chat Assistant & RAG Q&A */}
          {activeTab === 'chat' && (
            <div className="h-full flex flex-col">
              {/* Message scroll list */}
              <div className="flex-1 bg-slate-950/40 rounded-xl border border-slate-800 p-4 overflow-y-auto space-y-4 max-h-[460px]">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6 text-slate-500">
                    <Bot className="w-12 h-12 text-blue-500/60 mb-3 animate-pulse" />
                    <h4 className="font-bold text-slate-300 text-sm">How can I assist you with your exam prep?</h4>
                    <p className="text-xs text-slate-500 max-w-sm mt-1">
                      You can ask anything regarding GATE syllabus, regulations, or verify definitions based on uploaded reference materials.
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex space-x-3 ${msg.role === 'USER' ? 'justify-end' : 'justify-start'}`}
                    >
                      {msg.role !== 'USER' && (
                        <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                          <Bot className="w-4 h-4" />
                        </div>
                      )}
                      <div
                        className={`p-3 rounded-2xl max-w-[80%] text-xs shadow ${
                          msg.role === 'USER'
                            ? 'bg-blue-600 text-white rounded-tr-none'
                            : 'bg-slate-850 text-slate-100 rounded-tl-none border border-slate-750'
                        }`}
                      >
                        <div className="whitespace-pre-line leading-relaxed">{msg.content}</div>

                        {/* Structured Action: Download Student Data Excel Button */}
                        {msg.action?.type === 'DOWNLOAD_STUDENT_EXCEL' && (
                          <div className="mt-3 pt-2.5 border-t border-slate-750">
                            <div className="flex flex-col space-y-1.5">
                              <button
                                type="button"
                                onClick={() => handleDownloadExcelAction(msg)}
                                disabled={downloadingExcelMsgId === msg.id}
                                className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white shadow-xs transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                              >
                                {downloadingExcelMsgId === msg.id ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                                    <span>Preparing Excel...</span>
                                  </>
                                ) : downloadSuccessMsgId === msg.id ? (
                                  <>
                                    <Check className="w-4 h-4 text-white" />
                                    <span>Downloaded ({msg.action?.fileName || 'Excel file'})</span>
                                  </>
                                ) : (
                                  <>
                                    <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
                                    <span>Download Excel</span>
                                    <Download className="w-3.5 h-3.5 text-emerald-200 ml-0.5" />
                                  </>
                                )}
                              </button>

                              {msg.action?.fileName && downloadSuccessMsgId !== msg.id && (
                                <span className="text-[10px] text-slate-400 font-mono text-center">
                                  📄 {msg.action.fileName}
                                </span>
                              )}

                              {downloadExcelError && downloadExcelError.msgId === msg.id && (
                                <div className="flex items-center space-x-1 text-[11px] text-red-400 bg-red-950/40 p-1.5 rounded border border-red-800/50 mt-1">
                                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span>{downloadExcelError.error}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="text-[9px] text-slate-500 mt-1.5 text-right">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {isLoadingChat && streamingStatus && (
                  <div className="flex items-center space-x-2 text-slate-400 bg-slate-850 border border-slate-750 rounded-2xl p-3 max-w-[50%] text-xs">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    <span>{streamingStatus}</span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* RAG Citation Sources Card list */}
              {citations.length > 0 && (
                <div className="mt-3 bg-blue-950/20 border border-blue-900/30 rounded-xl p-3">
                  <div className="text-xs font-semibold text-blue-400 mb-1.5 flex items-center space-x-1.5">
                    <FileText className="w-4 h-4 text-blue-400" />
                    <span>Retrieved Knowledge References ({citations.length}):</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] text-slate-400">
                    {citations.map((c, idx) => (
                      <div key={idx} className="bg-slate-900/50 border border-slate-800 rounded-lg p-2 flex items-start space-x-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-300 truncate">{c.documentTitle}</div>
                          <div className="italic text-slate-500 line-clamp-1">"{c.content}"</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Chat Input form */}
              <form onSubmit={handleSendChat} className="mt-4 flex space-x-3">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Ask a question about reference materials or system analytics..."
                  className="flex-1 bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-600 transition-colors"
                />
                {isLoadingChat ? (
                  <button
                    type="button"
                    onClick={handleStopChat}
                    className="px-5 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold transition-all text-xs flex items-center space-x-1.5 cursor-pointer"
                  >
                    <span>Stop</span>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!inputText.trim()}
                    className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all text-xs flex items-center space-x-1.5 disabled:opacity-50 disabled:hover:bg-blue-600 cursor-pointer"
                  >
                    <span>Send</span>
                    <Send className="w-3.5 h-3.5" />
                  </button>
                )}
              </form>
            </div>
          )}

          {/* TAB 3: Practice Mode (Student only) */}
          {activeTab === 'practice' && (
            <div className="space-y-6">
              {/* Practice Quiz Configurator */}
              {!practiceSet && (
                <div className="bg-slate-950/30 border border-slate-800 p-5 rounded-xl space-y-4">
                  <h4 className="text-sm font-semibold text-blue-400 flex items-center space-x-2">
                    <BookOpen className="w-4 h-4" />
                    <span>Configure Practice Quiz</span>
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                    <div>
                      <label className="block text-slate-400 mb-1">Subject</label>
                      <input
                        type="text"
                        value={practiceSubject}
                        onChange={(e) => setPracticeSubject(e.target.value)}
                        placeholder="e.g. Algorithms"
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Topic</label>
                      <input
                        type="text"
                        value={practiceTopic}
                        onChange={(e) => setPracticeTopic(e.target.value)}
                        placeholder="e.g. Sorting"
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Difficulty</label>
                      <select
                        value={practiceDifficulty}
                        onChange={(e) => setPracticeDifficulty(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 focus:outline-none focus:border-blue-600 text-slate-300"
                      >
                        <option value="EASY">EASY</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HARD">HARD</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Questions Count</label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={practiceCount}
                        onChange={(e) => setPracticeCount(Math.min(10, parseInt(e.target.value) || 1))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleGeneratePractice}
                    disabled={isGeneratingPractice}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold p-3 rounded-lg text-xs transition-colors flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
                  >
                    {isGeneratingPractice ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Generating custom practice set...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        <span>Launch Practice Quiz</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Quiz Quiz Layout */}
              {practiceSet && !practiceResult && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-slate-950 p-4 border border-slate-800 rounded-xl">
                    <div>
                      <h3 className="text-sm font-bold text-blue-400">{practiceSet.subject} - {practiceSet.topic}</h3>
                      <div className="text-[10px] text-slate-500 mt-0.5">Difficulty: {practiceSet.difficulty} | Total: {practiceSet.questions.length} questions</div>
                    </div>
                    <button
                      onClick={() => setPracticeSet(null)}
                      className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer"
                    >
                      Exit Quiz
                    </button>
                  </div>

                  <div className="space-y-4">
                    {practiceSet.questions.map((q: any, qIdx: number) => (
                      <div key={qIdx} className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-3">
                        <div className="text-xs font-bold text-slate-400">Question {qIdx + 1}</div>
                        <div className="text-xs text-slate-200 leading-relaxed">{q.question}</div>

                        {/* MCQ Options Rendering */}
                        {q.options && q.options.length > 0 ? (
                          <div className="grid grid-cols-1 gap-2 pl-3">
                            {q.options.map((opt: string, oIdx: number) => (
                              <label key={oIdx} className="flex items-center space-x-2 text-xs text-slate-300 hover:text-slate-100 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`q-${qIdx}`}
                                  checked={studentAnswers[qIdx] === oIdx.toString()}
                                  onChange={() => {
                                    setStudentAnswers((prev) => {
                                      const next = [...prev];
                                      next[qIdx] = oIdx.toString();
                                      return next;
                                    });
                                  }}
                                  className="border-slate-800 bg-slate-900 text-blue-600 focus:ring-0 focus:outline-none"
                                />
                                <span>{String.fromCharCode(65 + oIdx)}. {opt}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          // NAT Input Rendering
                          <div className="pl-3">
                            <label className="block text-slate-500 text-[10px] mb-1">Enter your numerical answer:</label>
                            <input
                              type="text"
                              value={studentAnswers[qIdx]}
                              onChange={(e) => {
                                setStudentAnswers((prev) => {
                                  const next = [...prev];
                                  next[qIdx] = e.target.value;
                                  return next;
                                });
                              }}
                              placeholder="e.g. 3.14"
                              className="bg-slate-900 border border-slate-800 text-xs text-slate-100 rounded-lg p-2 w-48 focus:outline-none focus:border-blue-600"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleSubmitPractice}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold p-3 rounded-lg text-xs transition-colors flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Submit Practice Quiz Answers</span>
                  </button>
                </div>
              )}

              {/* Practice Results feedback */}
              {practiceResult && (
                <div className="space-y-4">
                  <div className="bg-slate-950/60 p-6 border border-slate-850 rounded-xl text-center space-y-3">
                    <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                    <h3 className="text-base font-bold text-slate-100">Practice Quiz Completed!</h3>
                    <div className="flex justify-center space-x-6 text-xs">
                      <div>
                        <div className="text-slate-500">Correct answers</div>
                        <div className="text-base font-bold text-emerald-400">{practiceResult.score} / {practiceResult.total}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Accuracy rate</div>
                        <div className="text-base font-bold text-blue-400">{practiceResult.accuracy}%</div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setPracticeSet(null);
                        setPracticeResult(null);
                      }}
                      className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      Start Another Practice Quiz
                    </button>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-xs uppercase text-slate-500 font-semibold px-1">Answer Key & Explanations</h4>
                    {practiceResult.questions.map((q: any, qIdx: number) => {
                      const ans = q.correctAnswer;
                      const studentAns = practiceResult.studentAnswers[qIdx];
                      const isCorrect = q.isCorrect;

                      return (
                        <div key={qIdx} className={`border rounded-xl p-5 space-y-3 ${
                          isCorrect ? 'bg-emerald-950/15 border-emerald-900/35' : 'bg-red-950/15 border-red-900/35'
                        }`}>
                          <div className="text-xs text-slate-200 leading-relaxed font-semibold">{q.question}</div>
                          
                          <div className="text-xs grid grid-cols-2 gap-4 text-slate-400 bg-slate-900/50 p-3 rounded-lg">
                            <div>
                              <span className="font-semibold text-slate-300">Your Answer: </span>
                              <span className={isCorrect ? 'text-emerald-400' : 'text-red-400'}>{studentAns || '(Empty)'}</span>
                            </div>
                            <div>
                              <span className="font-semibold text-slate-300">Correct Answer: </span>
                              <span className="text-emerald-400">{ans}</span>
                            </div>
                          </div>

                          {q.explanation && (
                            <div className="text-xs italic text-slate-500 pl-2 border-l border-slate-700">
                              <span className="font-semibold text-slate-400">Explanation: </span>
                              <span>{q.explanation}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Attempts History */}
              {practiceAttempts.length > 0 && !practiceSet && (
                <div className="space-y-3">
                  <h4 className="text-xs uppercase text-slate-500 font-semibold px-1">Practice Quiz History</h4>
                  <div className="bg-slate-950/40 border border-slate-800 rounded-xl overflow-hidden text-xs">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-medium">
                          <th className="p-3">Subject / Topic</th>
                          <th className="p-3 text-center">Score</th>
                          <th className="p-3 text-center">Accuracy</th>
                          <th className="p-3">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {practiceAttempts.map((att) => (
                          <tr key={att.id} className="border-b border-slate-850 hover:bg-slate-900/30">
                            <td className="p-3">
                              <div className="font-semibold text-slate-200">{att.subject}</div>
                              <div className="text-[10px] text-slate-500">{att.topic}</div>
                            </td>
                            <td className="p-3 text-center font-bold text-slate-300">{att.score} / {att.total}</td>
                            <td className="p-3 text-center font-bold text-blue-400">{att.accuracy}%</td>
                            <td className="p-3 text-slate-500 text-[10px]">{new Date(att.createdAt).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Student Performance Insights */}
          {activeTab === 'insights' && (
            <div className="space-y-6">
              {isLoadingInsights ? (
                <div className="flex flex-col items-center justify-center p-12 text-slate-500 text-xs">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500 mb-2" />
                  <span>Analyzing mock test performance logs...</span>
                </div>
              ) : !insights || !insights.subjects ? (
                <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-8 text-center text-slate-500">
                  <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <h4 className="font-bold text-slate-400 text-sm">No sufficient performance data available.</h4>
                  <p className="text-xs text-slate-500 max-w-sm mt-1 mx-auto">
                    Complete mock test assessments in your portal to view detailed subject-by-subject accuracy breakdowns and AI-driven practice recommendations.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Analysis Summary Blocks */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-950/30 border border-emerald-900/30 rounded-xl p-5">
                      <div className="text-xs font-semibold text-emerald-400 flex items-center space-x-1.5 mb-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Strong Areas (Accuracy &ge; 70%)</span>
                      </div>
                      {insights.strongSubjects.length === 0 ? (
                        <div className="text-slate-600 text-xs italic">No strong subjects logged yet.</div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {insights.strongSubjects.map((s: string, idx: number) => (
                            <span key={idx} className="bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 text-[10px] px-2.5 py-1 rounded-full font-bold">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-950/30 border border-red-950/30 rounded-xl p-5">
                      <div className="text-xs font-semibold text-red-400 flex items-center space-x-1.5 mb-2">
                        <AlertCircle className="w-4 h-4 text-red-400" />
                        <span>Weak Areas (Accuracy &lt; 50%)</span>
                      </div>
                      {insights.weakSubjects.length === 0 ? (
                        <div className="text-slate-600 text-xs italic">No weak subjects logged. Good job!</div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {insights.weakSubjects.map((s: string, idx: number) => (
                            <span key={idx} className="bg-red-600/10 border border-red-500/20 text-red-400 text-[10px] px-2.5 py-1 rounded-full font-bold">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Subject Accuracy details */}
                  <div className="space-y-3">
                    <h4 className="text-xs uppercase text-slate-500 font-semibold px-1">Subject Accuracy Breakdown</h4>
                    <div className="space-y-2">
                      {insights.subjects.map((sub: any, idx: number) => (
                        <div key={idx} className="bg-slate-950/40 border border-slate-800 p-4 rounded-xl flex items-center justify-between text-xs">
                          <div>
                            <div className="font-semibold text-slate-200">{sub.name}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">Attempted: {sub.total} questions | Correct: {sub.correct}</div>
                          </div>
                          
                          <div className="flex items-center space-x-3">
                            {/* Simple Progress Bar */}
                            <div className="w-32 bg-slate-800 h-2 rounded-full overflow-hidden hidden sm:block">
                              <div
                                className={`h-full rounded-full ${
                                  sub.accuracy >= 70
                                    ? 'bg-emerald-500'
                                    : sub.accuracy < 50
                                    ? 'bg-red-500'
                                    : 'bg-blue-500'
                                }`}
                                style={{ width: `${sub.accuracy}%` }}
                              />
                            </div>
                            <span className={`font-bold ${
                              sub.accuracy >= 70
                                ? 'text-emerald-400'
                                : sub.accuracy < 50
                                ? 'text-red-400'
                                : 'text-blue-400'
                            }`}>{sub.accuracy}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Practice Recommendations */}
                  {insights.recommendations && insights.recommendations.length > 0 && (
                    <div className="bg-blue-950/15 border border-blue-900/35 rounded-xl p-5 space-y-3">
                      <h4 className="text-xs font-semibold text-blue-400 flex items-center space-x-1.5">
                        <Sparkles className="w-4.5 h-4.5 text-blue-400" />
                        <span>Recommended Practice Actions:</span>
                      </h4>
                      <ul className="text-xs space-y-2 pl-1.5 text-slate-400">
                        {insights.recommendations.map((rec: string, idx: number) => (
                          <li key={idx} className="flex items-start space-x-2">
                            <ArrowRight className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
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

export default AIExaminationAssistant;
