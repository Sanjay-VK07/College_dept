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
} from 'lucide-react';
import api from '@/lib/api';

interface AIExaminationAssistantProps {
  role?: string; // STUDENT, FACULTY, ADMIN
}

export const AIExaminationAssistant: React.FC<AIExaminationAssistantProps> = ({ role = 'STUDENT' }) => {
  // Tabs: 'chat', 'generator' (faculty/admin), 'practice' (student), 'insights' (student)
  const [activeTab, setActiveTab] = useState<'chat' | 'generator' | 'practice' | 'insights'>('chat');

  // Conversational state
  const [conversations, setConversations] = useState<AIConversationSummary[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // RAG references for current message or conversation
  const [citations, setCitations] = useState<any[]>([]);

  // Question Generator State (Faculty/Admin)
  const [genSubject, setGenSubject] = useState('');
  const [genTopic, setGenTopic] = useState('');
  const [genDifficulty, setGenDifficulty] = useState('MEDIUM');
  const [genType, setGenType] = useState('MCQ');
  const [genCount, setGenCount] = useState(3);
  const [genMarks, setGenMarks] = useState(1);
  const [genNegMarks, setGenNegMarks] = useState(0);
  const [genDocs, setGenDocs] = useState<string[]>([]);
  const [availableDocs, setAvailableDocs] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<any[]>([]);
  const [savedQuestionIds, setSavedQuestionIds] = useState<Set<string>>(new Set());
  const [availableSubtopics, setAvailableSubtopics] = useState<any[]>([]);
  const [selectedSubtopicId, setSelectedSubtopicId] = useState('');

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

  // Subjects & Topics cache (fetched from DB)
  const [subjectsList, setSubjectsList] = useState<any[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load basic lists
  useEffect(() => {
    fetchConversations();
    fetchSubjectsAndTopics();
    if (role === 'FACULTY' || role === 'ADMIN') {
      fetchAvailableDocuments();
    }
    if (role === 'STUDENT') {
      fetchPracticeAttempts();
      fetchInsights();
    }
  }, [role]);

  // Scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoadingChat]);

  // Fetch subjects & subtopics from actual Question Bank endpoints
  const fetchSubjectsAndTopics = async () => {
    try {
      const res = await api.get('/question-bank/subjects');
      if (res.data?.success) {
        setSubjectsList(res.data.data || []);
      }
    } catch (e) {
      console.error('Failed to fetch subjects');
    }
  };

  // Fetch subtopics when subject changes
  useEffect(() => {
    if (!selectedSubjectId) return;
    const fetchSubtopics = async () => {
      try {
        const res = await api.get(`/question-bank/subjects/${selectedSubjectId}/subtopics`);
        if (res.data?.success) {
          setAvailableSubtopics(res.data.data || []);
        }
      } catch (e) {
        console.error('Failed to fetch subtopics');
      }
    };
    fetchSubtopics();
  }, [selectedSubjectId]);

  const fetchConversations = async () => {
    try {
      const list = await aiService.getConversations();
      setConversations(list || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAvailableDocuments = async () => {
    try {
      const res = await aiService.getDocuments('READY');
      if (res.data?.success) {
        setAvailableDocs(res.data.data || []);
      }
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

  const handleSendChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isLoadingChat) return;

    const text = inputText.trim();
    setInputText('');

    const userMsg: AIMessage = {
      id: 'user-' + Date.now(),
      role: 'USER',
      content: text,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoadingChat(true);

    try {
      const response = await aiService.sendMessage(text, currentConversationId);
      if (response.success) {
        if (response.conversationId) {
          setCurrentConversationId(response.conversationId);
          fetchConversations();
        }
        if (response.message) {
          setMessages((prev) => [...prev, response.message!]);
        }
        // Save citation sources if RAG matches
        if (response.sources && response.sources.length > 0) {
          setCitations(response.sources);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: 'err-' + Date.now(),
            role: 'ASSISTANT',
            content: response.error || 'The AI service is currently unavailable. Please try again later.',
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: 'err-' + Date.now(),
          role: 'ASSISTANT',
          content: 'Connection error. Please try again later.',
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoadingChat(false);
    }
  };

  // Faculty Generator Actions
  const handleGenerateQuestions = async () => {
    if (!genSubject || !genTopic) {
      alert('Please fill in Subject and Topic.');
      return;
    }
    setIsGenerating(true);
    setGeneratedQuestions([]);
    setSavedQuestionIds(new Set());
    try {
      const res = await aiService.generateQuestions({
        subject: genSubject,
        topic: genTopic,
        difficulty: genDifficulty,
        questionType: genType,
        count: genCount,
        marks: genMarks,
        negativeMarking: genNegMarks,
        documentIds: genDocs.length > 0 ? genDocs : undefined,
      });

      if (res.success) {
        setGeneratedQuestions(res.data || []);
      } else {
        alert(res.message || 'Question generation failed.');
      }
    } catch (e: any) {
      alert(e.response?.data?.message || 'Error generating questions.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveQuestion = async (q: any, idx: number) => {
    if (!selectedSubtopicId) {
      alert('Please select a Subtopic from the dropdown first to link this question.');
      return;
    }
    try {
      const payload = {
        ...q,
        subtopicId: selectedSubtopicId,
        marks: genMarks,
        negativeMarks: genNegMarks,
        difficulty: genDifficulty,
      };

      const res = await aiService.saveGeneratedQuestion(payload);
      if (res.success) {
        setSavedQuestionIds((prev) => {
          const next = new Set(prev);
          next.add(idx.toString());
          return next;
        });
        alert('Question saved to Question Bank successfully!');
      } else {
        alert(res.message || 'Failed to save question.');
      }
    } catch (e: any) {
      alert(e.response?.data?.message || 'Error saving question.');
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
    <div className="flex h-[750px] bg-slate-900 border border-slate-700/60 rounded-2xl overflow-hidden shadow-2xl text-slate-100 font-sans">
      {/* Sidebar Conversation Browser */}
      <div className="w-80 bg-slate-950 border-r border-slate-800 flex flex-col justify-between">
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
      <div className="flex-1 flex flex-col bg-slate-900">
        {/* Navigation Tabs */}
        <div className="flex bg-slate-950 border-b border-slate-800 px-6 py-2">
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

          {(role === 'FACULTY' || role === 'ADMIN') && (
            <button
              onClick={() => setActiveTab('generator')}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition-all ${
                activeTab === 'generator'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              AI Question Generator
            </button>
          )}

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
                        <div className="text-[9px] text-slate-500 mt-1.5 text-right">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {isLoadingChat && (
                  <div className="flex items-center space-x-2 text-slate-500 bg-slate-850 border border-slate-750 rounded-2xl p-3 max-w-[40%] text-xs">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    <span>AI is formulating response...</span>
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
                <button
                  type="submit"
                  disabled={isLoadingChat || !inputText.trim()}
                  className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all text-xs flex items-center space-x-1.5 disabled:opacity-50 disabled:hover:bg-blue-600 cursor-pointer"
                >
                  <span>Send</span>
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: AI Question Generator (Faculty/Admin) */}
          {activeTab === 'generator' && (
            <div className="space-y-6">
              {/* Controls Form Grid */}
              <div className="bg-slate-950/30 border border-slate-800 p-5 rounded-xl space-y-4">
                <h4 className="text-sm font-semibold text-blue-400 flex items-center space-x-2">
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Exam Questions</span>
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Subject</label>
                    <input
                      type="text"
                      value={genSubject}
                      onChange={(e) => setGenSubject(e.target.value)}
                      placeholder="e.g. Computer Networks"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Topic</label>
                    <input
                      type="text"
                      value={genTopic}
                      onChange={(e) => setGenTopic(e.target.value)}
                      placeholder="e.g. TCP Congestion Control"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Difficulty</label>
                    <select
                      value={genDifficulty}
                      onChange={(e) => setGenDifficulty(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 focus:outline-none focus:border-blue-600 text-slate-300"
                    >
                      <option value="EASY">EASY</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HARD">HARD</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Question Type</label>
                    <select
                      value={genType}
                      onChange={(e) => setGenType(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 focus:outline-none focus:border-blue-600 text-slate-300"
                    >
                      <option value="MCQ">MCQ (Single Correct)</option>
                      <option value="MSQ">MSQ (Multiple Select)</option>
                      <option value="NAT">NAT (Numerical Answer)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Count (Limit: 5)</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={genCount}
                      onChange={(e) => setGenCount(Math.min(5, parseInt(e.target.value) || 1))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Marks</label>
                    <input
                      type="number"
                      value={genMarks}
                      onChange={(e) => setGenMarks(parseFloat(e.target.value) || 1)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Negative Marks</label>
                    <input
                      type="number"
                      value={genNegMarks}
                      onChange={(e) => setGenNegMarks(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                {/* Scope to Documents */}
                <div className="text-xs">
                  <label className="block text-slate-400 mb-1.5">Scope Search Reference Documents (Optional)</label>
                  <div className="max-h-24 overflow-y-auto bg-slate-900 border border-slate-800 rounded-lg p-2.5 space-y-1.5">
                    {availableDocs.length === 0 ? (
                      <div className="text-slate-600 text-xs italic">No documents uploaded.</div>
                    ) : (
                      availableDocs.map((doc) => (
                        <label key={doc.id} className="flex items-center space-x-2 text-slate-300 hover:text-slate-100 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={genDocs.includes(doc.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setGenDocs((prev) => [...prev, doc.id]);
                              } else {
                                setGenDocs((prev) => prev.filter((id) => id !== doc.id));
                              }
                            }}
                            className="rounded border-slate-800 focus:ring-0 focus:outline-none"
                          />
                          <span>{doc.title}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <button
                  onClick={handleGenerateQuestions}
                  disabled={isGenerating}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold p-3 rounded-lg text-xs transition-colors flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>AI is synthesizing questions...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Synthesize Questions from RAG</span>
                    </>
                  )}
                </button>
              </div>

              {/* Review Panel */}
              {generatedQuestions.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h3 className="text-sm font-semibold text-blue-400">Review Synthesized Questions</h3>
                    
                    {/* Link to Subtopic selector */}
                    <div className="flex items-center space-x-2 text-xs">
                      <span className="text-slate-400">Question Bank Subject:</span>
                      <select
                        value={selectedSubjectId}
                        onChange={(e) => setSelectedSubjectId(e.target.value)}
                        className="bg-slate-900 border border-slate-800 text-slate-200 rounded p-1.5"
                      >
                        <option value="">-- Choose Subject --</option>
                        {subjectsList.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>

                      <span className="text-slate-400 ml-2">Link to Subtopic:</span>
                      <select
                        value={selectedSubtopicId}
                        onChange={(e) => setSelectedSubtopicId(e.target.value)}
                        disabled={!selectedSubjectId}
                        className="bg-slate-900 border border-slate-800 text-slate-200 rounded p-1.5 disabled:opacity-50"
                      >
                        <option value="">-- Select Subtopic --</option>
                        {availableSubtopics.map((st) => (
                          <option key={st.id} value={st.id}>{st.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {generatedQuestions.map((q, idx) => (
                      <div key={idx} className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-3">
                        <div className="flex justify-between items-start">
                          <span className="text-slate-400 text-xs font-bold">Question {idx + 1}</span>
                          <button
                            onClick={() => handleSaveQuestion(q, idx)}
                            disabled={savedQuestionIds.has(idx.toString())}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1.5 ${
                              savedQuestionIds.has(idx.toString())
                                ? 'bg-emerald-600/25 border border-emerald-500/20 text-emerald-400 cursor-default'
                                : 'bg-blue-600 hover:bg-blue-500 text-white'
                            }`}
                          >
                            {savedQuestionIds.has(idx.toString()) ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Approved & Added</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5" />
                                <span>Approve & Save to Bank</span>
                              </>
                            )}
                          </button>
                        </div>

                        <div className="text-xs text-slate-200 font-semibold">
                          {(() => {
                            const text = q.question || q.stem || '';
                            const imgRegex = /!\[.*?\]\((.*?)\)/;
                            const match = text.match(imgRegex);
                            if (match) {
                              const imageUrl = match[1];
                              const cleanText = text.replace(imgRegex, '').trim();
                              return (
                                <div className="space-y-4">
                                  <div>{cleanText}</div>
                                  <div className="flex justify-center p-4 bg-slate-900 border border-slate-800 rounded-lg">
                                    <img src={imageUrl} alt="Question Diagram" className="max-h-72 object-contain" />
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <div className="space-y-4">
                                <div>{text}</div>
                                {q.imageUrl && (
                                  <div className="flex justify-center p-4 bg-slate-900 border border-slate-800 rounded-lg">
                                    <img src={q.imageUrl} alt="Question Diagram" className="max-h-72 object-contain" />
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Options */}
                        {q.options && q.options.length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-3">
                            {q.options.map((opt: string, oIdx: number) => (
                              <div key={oIdx} className="text-xs text-slate-400 flex items-start space-x-1.5">
                                <span className="font-semibold text-blue-400">{String.fromCharCode(65 + oIdx)}.</span>
                                <span>{opt}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-850 space-y-1.5 text-xs text-slate-400">
                          <div>
                            <span className="font-semibold text-slate-300">Correct Answer: </span>
                            <span className="text-emerald-400">
                              {typeof q.correctAnswer === 'object'
                                ? JSON.stringify(q.correctAnswer)
                                : q.correctAnswer}
                            </span>
                          </div>
                          {q.explanation && (
                            <div>
                              <span className="font-semibold text-slate-300">Explanation: </span>
                              <span className="italic">{q.explanation}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
