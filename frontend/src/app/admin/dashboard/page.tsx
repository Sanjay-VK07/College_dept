'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  GraduationCap,
  Users,
  UserCheck,
  BookOpen,
  FileSpreadsheet,
  Clock,
  CheckCircle,
  AlertCircle,
  Plus,
  Trash2,
  Edit,
  RotateCcw,
  Search,
  Filter,
  Download,
  Database,
  Radio,
  BarChart3,
  Settings,
  Lock,
  LogOut,
  ChevronRight,
  ChevronDown,
  TrendingUp,
  ShieldCheck,
  FileText,
  Activity,
  X,
  Bell,
  CheckSquare,
  Zap,
  Cpu,
  Sparkles,
  Calendar,
  Layers,
  ArrowUpDown,
  Server,
  Mail,
  HardDrive,
  Key,
  Award,
  RefreshCw,
  LayoutGrid,
  List,
  Copy,
  Eye,
  Archive,
  Printer,
  FileCheck,
  UserPlus,
  PieChart as PieChartIcon,
  Bot,
} from 'lucide-react';
import api from '@/lib/api';
import { aiService } from '@/services/aiService';
import { exportToCSV, printOrExportPDF } from '@/lib/exportUtils';
import { AIExaminationAssistant } from '@/components/ai/AIExaminationAssistant';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

export default function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    | 'OVERVIEW'
    | 'EXAMS'
    | 'QUESTIONS'
    | 'STUDENTS'
    | 'FACULTY'
    | 'DEPARTMENTS'
    | 'RESULTS'
    | 'ANALYTICS'
    | 'REPORTS'
    | 'HEALTH'
    | 'INTELLIGENCE'
    | 'GOVERNANCE'
    | 'LOGS'
    | 'SETTINGS'
    | 'AI_ASSISTANT'
  >('OVERVIEW');

  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [searchGlobal, setSearchGlobal] = useState('');

  // RAG Observability & Monitoring States
  const [ragHealth, setRagHealth] = useState<any>(null);
  const [ragMetrics, setRagMetrics] = useState<any>(null);
  const [ragTraces, setRagTraces] = useState<any>(null);
  const [loadingRag, setLoadingRag] = useState(false);

  // Table State: Student Roster
  const [students, setStudents] = useState<any[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [studentSortOrder, setStudentSortOrder] = useState<'ASC' | 'DESC'>('ASC');
  const [studentPage, setStudentPage] = useState(1);
  const itemsPerPage = 5;

  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [newStudent, setNewStudent] = useState({
    registerNo: '',
    name: '',
    email: '',
    department: 'Computer Science and Engineering',
    year: '3',
    semester: '6',
    section: 'A',
  });

  // Table State: Faculty Directory
  const [faculty, setFaculty] = useState<any[]>([]);
  const [isAddFacultyOpen, setIsAddFacultyOpen] = useState(false);
  const [newFaculty, setNewFaculty] = useState({ name: '', email: '', department: 'Computer Science and Engineering' });

  // Question Bank & Exams
  const [questions, setQuestions] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);

  // AI Question Generation States
  const [aiGenType, setAiGenType] = useState<string>('MCQ');
  const [aiGenDifficulty, setAiGenDifficulty] = useState<string>('MEDIUM');
  const [aiGenCount, setAiGenCount] = useState<number>(1);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState<boolean>(false);
  const [genMessage, setGenMessage] = useState<string>('');
  const [pendingAiQuestions, setPendingAiQuestions] = useState<any[]>([]);

  // AI Solution & Exam Assembly States
  const [pendingSolutions, setPendingSolutions] = useState<any[]>([]);
  const [isGeneratingSolutionId, setIsGeneratingSolutionId] = useState<string | null>(null);
  const [isAssemblingExam, setIsAssemblingExam] = useState<boolean>(false);
  const [examAssembleTitle, setExamAssembleTitle] = useState<string>('');
  const [examAssembleCount, setExamAssembleCount] = useState<number>(10);

  // Faculty & Examination Intelligence States
  const [facultyIntelligence, setFacultyIntelligence] = useState<any | null>(null);
  const [loadingIntelligence, setLoadingIntelligence] = useState<boolean>(false);

  // AI Governance & Operations States
  const [governanceData, setGovernanceData] = useState<any | null>(null);
  const [loadingGovernance, setLoadingGovernance] = useState<boolean>(false);

  // Examination Management Enhanced State
  const [examViewMode, setExamViewMode] = useState<'TABLE' | 'GRID'>('TABLE');
  const [examSearch, setExamSearch] = useState('');
  const [examDeptFilter, setExamDeptFilter] = useState('ALL');
  const [examSemFilter, setExamSemFilter] = useState('ALL');
  const [examFacultyFilter, setExamFacultyFilter] = useState('ALL');
  const [examStatusFilter, setExamStatusFilter] = useState('ALL');
  const [examDateRange, setExamDateRange] = useState('');
  const [examSortBy, setExamSortBy] = useState('NEWEST');
  const [expandedExamIds, setExpandedExamIds] = useState<string[]>([]);
  const [isCreateExamOpen, setIsCreateExamOpen] = useState(false);
  const [showAnalyticsPanel, setShowAnalyticsPanel] = useState(false);
  const [selectedExamPreview, setSelectedExamPreview] = useState<any>(null);

  const [newExamForm, setNewExamForm] = useState({
    title: '',
    description: '',
    examType: 'SCHEDULED',
    durationMinutes: '180',
    totalMarks: '100',
    targetDepartment: 'Computer Science and Engineering',
    maxViolations: '5',
    instructions: '1. Total Duration: 180 Minutes.\n2. Fullscreen security mode is strictly enforced.',
  });

  // Results Ledger & System Settings State
  const [resultsLedger, setResultsLedger] = useState<any[]>([]);
  const [systemSettings, setSystemSettings] = useState<any[]>([]);
  const [isAssignInvigilatorOpen, setIsAssignInvigilatorOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ testId: '', facultyId: '' });
  const [isAddQuestionOpen, setIsAddQuestionOpen] = useState(false);
  const [newQuestionForm, setNewQuestionForm] = useState({
    text: '',
    type: 'MCQ',
    difficulty: 'MEDIUM',
    marks: '1',
    negativeMarks: '0.33',
    explanation: '',
  });

  // Live Clock & Reactive State
  const [currentDateTime, setCurrentDateTime] = useState<string>('');

  useEffect(() => {
    const updateClock = () => {
      setCurrentDateTime(
        new Date().toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    updateClock();
    const clockInterval = setInterval(updateClock, 1000);

    fetchInitialData();
    // Reactive background polling every 30 seconds to update overview and notifications without flashing
    const pollInterval = setInterval(() => {
      fetchInitialData(true);
    }, 30000);

    return () => {
      clearInterval(clockInterval);
      clearInterval(pollInterval);
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4000);
  };

  const loadRagTelemetry = async () => {
    setLoadingRag(true);
    try {
      const [healthRes, metricsRes, tracesRes] = await Promise.all([
        aiService.getRagHealth(),
        aiService.getRagMetrics('24h'),
        aiService.getRagTraces({ page: 1, limit: 10 }),
      ]);
      if (healthRes?.success) setRagHealth(healthRes);
      if (metricsRes?.success) setRagMetrics(metricsRes.metrics);
      if (tracesRes?.success) setRagTraces(tracesRes);
    } catch (err) {
      console.error('Failed to load RAG telemetry:', err);
    } finally {
      setLoadingRag(false);
    }
  };

  const loadPendingAiQuestions = async () => {
    try {
      const res = await aiService.getPendingQuestions({ status: 'PENDING_REVIEW' });
      if (res?.success) setPendingAiQuestions(res.data || []);
    } catch (err) {
      console.error('Failed to load pending AI questions:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'HEALTH') {
      loadRagTelemetry();
    } else if (activeTab === 'QUESTIONS') {
      loadPendingAiQuestions();
      loadPendingSolutions();
    } else if (activeTab === 'INTELLIGENCE') {
      loadFacultyIntelligence();
    } else if (activeTab === 'GOVERNANCE') {
      loadGovernanceOverview();
    }
  }, [activeTab]);

  const handleGenerateAiQuestions = async () => {
    setIsGeneratingQuestions(true);
    setGenMessage('');
    try {
      const res = await aiService.generateQuestions({
        questionType: aiGenType,
        difficulty: aiGenDifficulty,
        count: aiGenCount,
        generationRequestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      });
      if (res?.success) {
        showToast(res.message || 'AI Question Generation completed!');
        loadPendingAiQuestions();
      } else {
        setGenMessage(res.message || 'Failed to generate questions.');
      }
    } catch (err: any) {
      setGenMessage(err.response?.data?.message || err.message || 'Generation failed.');
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  const handleApproveAiQuestion = async (id: string) => {
    try {
      const res = await aiService.approveQuestion(id);
      if (res?.success) {
        showToast('Question approved and published to Question Bank!');
        loadPendingAiQuestions();
        fetchInitialData(true);
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Approve failed.');
    }
  };

  const handleRejectAiQuestion = async (id: string) => {
    try {
      const res = await aiService.rejectQuestion(id);
      if (res?.success) {
        showToast('Question rejected.');
        loadPendingAiQuestions();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Reject failed.');
    }
  };

  const loadPendingSolutions = async () => {
    try {
      const res = await aiService.getPendingSolutions();
      if (res?.success) setPendingSolutions(res.data || []);
    } catch (err) {
      console.error('Failed to load pending solutions:', err);
    }
  };

  const handleGenerateSolution = async (questionId: string) => {
    setIsGeneratingSolutionId(questionId);
    try {
      const res = await aiService.generateSolution({
        questionId,
        generationRequestId: `sol_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      });
      if (res?.success) {
        showToast(res.message || 'Solution generated!');
        loadPendingSolutions();
      } else {
        showToast(res.message || 'Solution generation failed.');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || err.message || 'Solution generation error.');
    } finally {
      setIsGeneratingSolutionId(null);
    }
  };

  const handleApproveSolution = async (id: string) => {
    try {
      const res = await aiService.approveSolution(id);
      if (res?.success) {
        showToast('Solution approved and official Question Bank updated!');
        loadPendingSolutions();
        fetchInitialData(true);
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Approve solution failed.');
    }
  };

  const handleRejectSolution = async (id: string) => {
    try {
      const res = await aiService.rejectSolution(id);
      if (res?.success) {
        showToast('Solution rejected.');
        loadPendingSolutions();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Reject solution failed.');
    }
  };

  const handleAssembleExam = async () => {
    setIsAssemblingExam(true);
    try {
      const res = await aiService.assembleExam({
        examGenerationRequestId: `exam_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: examAssembleTitle || 'AI Assembled GATE Practice Test',
        questionCount: examAssembleCount,
        difficultyDistribution: { EASY: 30, MEDIUM: 50, HARD: 20 },
      });
      if (res?.success) {
        showToast(`Intelligent Exam assembled with ${res.selectedQuestionCount} questions as DRAFT!`);
        fetchInitialData(true);
      } else {
        showToast(res.message || 'Exam assembly failed.');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || err.message || 'Exam assembly failed.');
    } finally {
      setIsAssemblingExam(false);
    }
  };

  const loadFacultyIntelligence = async () => {
    setLoadingIntelligence(true);
    try {
      const res = await aiService.getFacultyIntelligenceOverview();
      if (res?.success) setFacultyIntelligence(res.data);
    } catch (err) {
      console.error('Failed to load faculty intelligence overview:', err);
    } finally {
      setLoadingIntelligence(false);
    }
  };

  const loadGovernanceOverview = async () => {
    setLoadingGovernance(true);
    try {
      const res = await aiService.getGovernanceOverview();
      if (res?.success) setGovernanceData(res.data);
    } catch (err) {
      console.error('Failed to load AI governance overview:', err);
    } finally {
      setLoadingGovernance(false);
    }
  };

  const toggleCircuitBreaker = async () => {
    if (!governanceData) return;
    const currentState = governanceData.circuitBreakerState?.circuitBreakerOpen;
    const targetState = !currentState;
    try {
      const res = await aiService.setCircuitBreaker(targetState);
      if (res?.success) {
        showToast(res.message || 'Circuit breaker state updated');
        loadGovernanceOverview();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to toggle circuit breaker');
    }
  };

  // Notifications State & Handlers
  const [dbNotifications, setDbNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState<boolean>(false);

  const fetchInitialData = async (silent: boolean = false) => {
    if (!silent) setLoading(true);
    setErrorState('');
    try {
      // Group 1: Core overview & notifications
      const [overviewRes, notifRes] = await Promise.all([
        api.get('/admin/overview'),
        api.get('/notifications'),
      ]);

      if (overviewRes.data?.success) setOverview(overviewRes.data.data);
      if (notifRes.data?.success) {
        setDbNotifications(notifRes.data.data.notifications || []);
        setUnreadCount(notifRes.data.data.unreadCount || 0);
      }

      // If silent poll, update core stats only
      if (silent) return;

      // Group 2: Management directories
      const [studentsRes, facultyRes, questionsRes, examsRes] = await Promise.all([
        api.get('/admin/students'),
        api.get('/admin/faculty'),
        api.get('/admin/questions'),
        api.get('/admin/exams'),
      ]);

      if (studentsRes.data?.success) setStudents(studentsRes.data.data);
      if (facultyRes.data?.success) setFaculty(facultyRes.data.data);
      if (questionsRes.data?.success) setQuestions(questionsRes.data.data);
      if (examsRes.data?.success) setExams(examsRes.data.data);

      // Group 3: System settings & ledger
      const [resultsRes, settingsRes] = await Promise.all([
        api.get('/admin/results-ledger'),
        api.get('/admin/settings'),
      ]);

      if (resultsRes.data?.success) setResultsLedger(resultsRes.data.data);
      if (settingsRes.data?.success) setSystemSettings(settingsRes.data.data);
    } catch (err: any) {
      console.error('Error fetching admin dashboard data:', err);
      if (!silent) {
        setErrorState(err.response?.data?.message || 'Failed to connect to backend server. Please retry.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await api.put(`/notifications/${id}/read`);
      fetchInitialData(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all');
      fetchInitialData(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteNotification = async (id: string) => {
    try {
      await api.delete(`/notifications/${id}`);
      fetchInitialData(true);
    } catch (e) {
      console.error(e);
    }
  };

  // Handlers: Student & Faculty
  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/students', newStudent);
      if (res.data?.success) {
        showToast('Student record added successfully');
        setIsAddStudentOpen(false);
        setNewStudent({ registerNo: '', name: '', email: '', department: 'Computer Science and Engineering', year: '3', semester: '6', section: 'A' });
        fetchInitialData();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to add student');
    }
  };

  const handleDeleteStudent = async (id: string) => {
    if (!confirm('Are you sure you want to delete this student record?')) return;
    try {
      await api.delete(`/admin/students/${id}`);
      showToast('Student record deleted');
      fetchInitialData();
    } catch (err: any) {
      showToast('Failed to delete student');
    }
  };

  const handleResetAttempts = async (id: string) => {
    if (!confirm('Reset exam attempt counter for this student?')) return;
    try {
      await api.post(`/admin/students/${id}/reset-attempts`);
      showToast('Student exam attempts reset successfully');
    } catch (err: any) {
      showToast('Failed to reset attempts');
    }
  };

  const handleAddFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/faculty', newFaculty);
      if (res.data?.success) {
        showToast('Faculty member added successfully');
        setIsAddFacultyOpen(false);
        setNewFaculty({ name: '', email: '', department: 'Computer Science and Engineering' });
        fetchInitialData();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to add faculty');
    }
  };

  const handleDeleteFaculty = async (id: string) => {
    if (!confirm('Remove this faculty member from system?')) return;
    try {
      await api.delete(`/admin/faculty/${id}`);
      showToast('Faculty member removed');
      fetchInitialData();
    } catch (err: any) {
      showToast('Failed to delete faculty');
    }
  };

  // Handlers: Examination Management
  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/exams', newExamForm);
      if (res.data?.success) {
        showToast('Examination scheduled and published successfully!');
        setIsCreateExamOpen(false);
        setNewExamForm({
          title: '',
          description: '',
          examType: 'SCHEDULED',
          durationMinutes: '180',
          totalMarks: '100',
          targetDepartment: 'Computer Science and Engineering',
          maxViolations: '5',
          instructions: '1. Total Duration: 180 Minutes.\n2. Fullscreen security mode is strictly enforced.',
        });
        fetchInitialData();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to create exam');
    }
  };

  const handleTogglePublishExam = async (id: string) => {
    try {
      const res = await api.put(`/admin/exams/${id}/publish`);
      if (res.data?.success) {
        showToast(res.data.message || 'Exam status updated');
        fetchInitialData();
      }
    } catch (err: any) {
      showToast('Failed to update publication status');
    }
  };

  const handleDeleteExam = async (id: string) => {
    if (!confirm('Are you sure you want to delete this examination?')) return;
    try {
      await api.delete(`/admin/exams/${id}`);
      showToast('Examination record deleted');
      fetchInitialData();
    } catch (err: any) {
      showToast('Failed to delete exam');
    }
  };

  const handleDuplicateExam = async (exam: any) => {
    try {
      const duplicateData = {
        title: `${exam.title} (Copy)`,
        description: exam.description,
        examType: exam.examType || 'SCHEDULED',
        durationMinutes: exam.durationMinutes,
        totalMarks: exam.totalMarks,
        targetDepartment: exam.targetDepartment || 'Computer Science and Engineering',
        maxViolations: exam.maxViolations || 5,
        instructions: exam.instructions,
      };
      const res = await api.post('/admin/exams', duplicateData);
      if (res.data?.success) {
        showToast(`Exam duplicated as "${duplicateData.title}"`);
        fetchInitialData();
      }
    } catch (err: any) {
      showToast('Failed to duplicate exam');
    }
  };

  const toggleExpandExamRow = (id: string) => {
    setExpandedExamIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleResetExamFilters = () => {
    setExamSearch('');
    setExamDeptFilter('ALL');
    setExamSemFilter('ALL');
    setExamFacultyFilter('ALL');
    setExamStatusFilter('ALL');
    setExamDateRange('');
    setExamSortBy('NEWEST');
  };

  // Export & Print Handlers
  const handleExportCSV = (filename: string, dataRows: any[]) => {
    exportToCSV(filename, dataRows);
    showToast(`Exported ${filename}.csv`);
  };

  const handleExportPDF = (filename: string) => {
    printOrExportPDF();
  };

  const handlePrint = () => {
    window.print();
  };

  // Question Bank CRUD & Upload Handlers
  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/questions', newQuestionForm);
      if (res.data?.success) {
        showToast('Question created successfully in Question Bank');
        setIsAddQuestionOpen(false);
        setNewQuestionForm({ text: '', type: 'MCQ', difficulty: 'MEDIUM', marks: '1', negativeMarks: '0.33', explanation: '' });
        fetchInitialData();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to create question');
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!confirm('Are you sure you want to delete this question?')) return;
    try {
      await api.delete(`/admin/questions/${id}`);
      showToast('Question removed from Question Bank');
      fetchInitialData();
    } catch (err: any) {
      showToast('Failed to delete question');
    }
  };

  const handleQuestionFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/admin/upload-questions', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data?.success) {
        showToast(res.data.message || 'Questions uploaded successfully');
        fetchInitialData();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to upload questions file');
    }
  };

  const handleStudentFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/admin/upload-students', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data?.success) {
        showToast(res.data.message || 'Student roster imported successfully');
        fetchInitialData();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to upload student roster');
    }
  };

  const handleAssignInvigilator = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/assign-invigilator', assignForm);
      if (res.data?.success) {
        showToast(res.data.message || 'Invigilator assigned successfully');
        setIsAssignInvigilatorOpen(false);
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to assign invigilator');
    }
  };

  const handleSaveSetting = async (key: string, value: string) => {
    try {
      const res = await api.put('/admin/settings', { key, value });
      if (res.data?.success) {
        showToast(`System setting '${key}' updated successfully`);
        fetchInitialData();
      }
    } catch (err: any) {
      showToast('Failed to update system setting');
    }
  };

  // Filter & Sort Students Table
  const filteredStudents = students
    .filter((s) => {
      const matchesSearch =
        s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
        s.email.toLowerCase().includes(studentSearch.toLowerCase()) ||
        (s.registerNo && s.registerNo.toLowerCase().includes(studentSearch.toLowerCase()));
      const matchesDept = deptFilter === 'ALL' || s.department === deptFilter;
      return matchesSearch && matchesDept;
    })
    .sort((a, b) => {
      if (studentSortOrder === 'ASC') return a.name.localeCompare(b.name);
      return b.name.localeCompare(a.name);
    });

  const totalStudentPages = Math.ceil(filteredStudents.length / itemsPerPage) || 1;
  const paginatedStudents = filteredStudents.slice((studentPage - 1) * itemsPerPage, studentPage * itemsPerPage);

  // Filter & Sort Exams Table
  const filteredExams = exams
    .filter((e) => {
      const matchesSearch =
        e.title.toLowerCase().includes(examSearch.toLowerCase()) ||
        (e.description && e.description.toLowerCase().includes(examSearch.toLowerCase()));

      const matchesDept =
        examDeptFilter === 'ALL' || e.targetDepartment === examDeptFilter;

      const matchesFaculty =
        examFacultyFilter === 'ALL' || e.createdBy?.name === examFacultyFilter;

      const matchesStatus =
        examStatusFilter === 'ALL'
          ? true
          : examStatusFilter === 'PUBLISHED'
          ? e.isPublished
          : examStatusFilter === 'DRAFT'
          ? !e.isPublished
          : true;

      return matchesSearch && matchesDept && matchesFaculty && matchesStatus;
    })
    .sort((a, b) => {
      if (examSortBy === 'NEWEST') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (examSortBy === 'OLDEST') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (examSortBy === 'TITLE_ASC') return a.title.localeCompare(b.title);
      if (examSortBy === 'MARKS_DESC') return b.totalMarks - a.totalMarks;
      return 0;
    });

  const COLORS = ['#1E40AF', '#16A34A', '#D97706', '#DC2626', '#7C3AED'];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center text-slate-600 space-y-3 font-sans">
        <div className="w-8 h-8 border-3 border-[#1E40AF] border-t-transparent rounded-full animate-spin" />
        <div className="text-sm font-medium">Fetching Live Data from Central Database...</div>
      </div>
    );
  }

  if (errorState) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 text-center font-sans space-y-4">
        <div className="erp-card max-w-md w-full space-y-4">
          <div className="inline-flex p-3 bg-red-100 text-red-600 rounded-full">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Database Connection Error</h2>
          <p className="text-xs text-slate-600 leading-relaxed">{errorState}</p>
          <button onClick={() => fetchInitialData()} className="erp-btn-primary w-full text-xs py-2">
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Connecting to Database</span>
          </button>
        </div>
      </div>
    );
  }

  // Real Database Metrics & Payloads
  const realMetrics = overview?.metrics || {
    students: students.length,
    faculty: faculty.length,
    departments: overview?.departmentBreakdown?.length || 1,
    questionBank: questions.length,
    activeExams: exams.filter((e) => e.isPublished).length,
    todaysExams: 0,
    completedExams: 0,
    pendingApprovals: exams.filter((e) => !e.isPublished).length,
    databaseStatus: 'CONNECTED',
    serverHealth: 'HEALTHY',
  };

  const todaysScheduleList = overview?.todaysSchedule || [];
  const recentActivities = overview?.recentActivities || [];
  const notificationsList = overview?.notifications || [];
  const pendingTasksList = overview?.pendingTasks || [];
  const systemHealthServices = overview?.systemHealth || [];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-sans select-none-security">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-md shadow-lg flex items-center space-x-2 text-xs font-semibold">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Navigation Header */}
      <header className="bg-[#1E40AF] text-white border-b border-blue-900 px-6 py-3 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-3 w-full sm:w-auto">
            <div className="p-2 bg-white/10 rounded-md border border-white/20 shrink-0">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">University Examination Management System</h1>
              <p className="text-xs text-blue-200">Controller of Examinations • Governance Dashboard v2.0</p>
            </div>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-blue-200" />
            <input
              type="text"
              value={searchGlobal}
              onChange={(e) => setSearchGlobal(e.target.value)}
              placeholder="Search Students, Faculty, Exams..."
              className="w-full bg-white/10 border border-white/20 rounded-md pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-blue-200 focus:outline-none focus:bg-white/20 transition-colors"
            />
          </div>

          <div className="flex items-center space-x-4 w-full sm:w-auto justify-end">
            <div className="flex items-center space-x-2 text-xs text-blue-100 hidden md:flex border-r border-blue-800 pr-4">
              <Calendar className="w-3.5 h-3.5 text-blue-200" />
              <span className="font-mono">{currentDateTime || 'Loading live time...'}</span>
            </div>

            <div className="relative">
              <button
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="p-2 rounded bg-white/10 hover:bg-white/20 text-white transition-colors relative flex items-center justify-center"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.2 text-[10px] font-bold font-mono bg-red-600 text-white rounded-full min-w-[18px] text-center border border-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown Panel */}
              {isNotificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-md shadow-xl border border-slate-200 z-50 text-slate-900 overflow-hidden">
                  <div className="flex justify-between items-center px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      System Notifications ({dbNotifications.length})
                    </span>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllAsRead}
                        className="text-[11px] font-semibold text-[#1E40AF] hover:underline"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {dbNotifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500 font-mono">
                        No notifications
                      </div>
                    ) : (
                      dbNotifications.map((notif: any) => (
                        <div
                          key={notif.id}
                          className={`p-3 text-xs flex justify-between items-start space-x-2 transition-colors ${
                            notif.isRead ? 'bg-white' : 'bg-blue-50/50'
                          }`}
                        >
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center space-x-1.5">
                              <span
                                className={`px-1.5 py-0.2 text-[9px] font-bold rounded uppercase ${
                                  notif.type === 'error'
                                    ? 'bg-red-100 text-red-700'
                                    : notif.type === 'warning'
                                    ? 'bg-amber-100 text-amber-800'
                                    : notif.type === 'success'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {notif.type}
                              </span>
                              <h5 className="font-bold text-slate-900 leading-snug">{notif.title}</h5>
                            </div>
                            <p className="text-slate-600 text-[11px] leading-relaxed">{notif.message}</p>
                            <span className="text-[10px] text-slate-400 font-mono block">
                              {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <div className="flex items-center space-x-1 shrink-0">
                            {!notif.isRead && (
                              <button
                                onClick={() => handleMarkAsRead(notif.id)}
                                className="p-1 text-[#1E40AF] hover:bg-blue-100 rounded"
                                title="Mark as Read"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteNotification(notif.id)}
                              className="p-1 text-slate-400 hover:text-red-600 rounded"
                              title="Delete Notification"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-white text-[#1E40AF] font-bold text-xs flex items-center justify-center border border-white/30">
                COE
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <span>Administrator</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" title="Status: Online" />
                </div>
                <div className="text-[10px] text-blue-200">Controller of Examinations</div>
              </div>
            </div>

            <button
              onClick={() => {
                localStorage.clear();
                router.push('/');
              }}
              title="Sign Out"
              className="p-2 rounded bg-blue-900/60 hover:bg-blue-900 text-blue-200 hover:text-white border border-blue-700 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container Layout */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto p-4 sm:p-6 gap-6">
        {/* Left Sidebar Navigation */}
        <aside className="w-64 bg-white border border-slate-200 rounded-lg p-3 space-y-1 shrink-0 h-fit shadow-sm">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Navigation Menu</div>
          {[
            { id: 'OVERVIEW', label: 'Dashboard Overview', icon: BarChart3 },
            { id: 'EXAMS', label: 'Examinations', icon: Clock, badge: realMetrics.activeExams },
            { id: 'QUESTIONS', label: 'Question Bank', icon: BookOpen, badge: realMetrics.questionBank },
            { id: 'STUDENTS', label: 'Students', icon: Users, badge: realMetrics.students },
            { id: 'FACULTY', label: 'Faculty', icon: UserCheck, badge: realMetrics.faculty },
            { id: 'DEPARTMENTS', label: 'Departments', icon: Layers, badge: realMetrics.departments },
            { id: 'RESULTS', label: 'Results', icon: Award },
            { id: 'ANALYTICS', label: 'Analytics', icon: TrendingUp },
            { id: 'INTELLIGENCE', label: 'Faculty Intelligence', icon: Cpu },
            { id: 'GOVERNANCE', label: 'AI Governance & Cost', icon: ShieldCheck },
            { id: 'REPORTS', label: 'Reports', icon: FileText },
            { id: 'HEALTH', label: 'System Health', icon: ShieldCheck },
            { id: 'LOGS', label: 'Audit Logs', icon: Activity },
            { id: 'SETTINGS', label: 'Settings', icon: Settings },
            { id: 'AI_ASSISTANT', label: 'AI Assistant', icon: Bot },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-semibold transition-colors ${
                  isActive
                    ? 'bg-[#1E40AF] text-white shadow-sm'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </div>
                {tab.badge !== undefined && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${isActive ? 'bg-blue-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        {/* Main Content Workspace */}
        <main className="flex-1 space-y-6 min-w-0">
          {/* TAB 1: OVERVIEW & DASHBOARD WIDGETS */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="erp-card">
                  <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Students</div>
                  <div className="text-2xl font-bold text-slate-900">{realMetrics.students}</div>
                  <p className="text-[11px] text-slate-500 mt-1">Real database count</p>
                </div>

                <div className="erp-card">
                  <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Faculty</div>
                  <div className="text-2xl font-bold text-slate-900">{realMetrics.faculty}</div>
                  <p className="text-[11px] text-slate-500 mt-1">Real database count</p>
                </div>

                <div className="erp-card">
                  <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Departments</div>
                  <div className="text-2xl font-bold text-slate-900">{realMetrics.departments}</div>
                  <p className="text-[11px] text-slate-500 mt-1">Active academic depts</p>
                </div>

                <div className="erp-card">
                  <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Question Bank</div>
                  <div className="text-2xl font-bold text-[#1E40AF]">{realMetrics.questionBank}</div>
                  <p className="text-[11px] text-slate-500 mt-1">Total questions in DB</p>
                </div>

                <div className="erp-card">
                  <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Active Exams</div>
                  <div className="text-2xl font-bold text-emerald-700">{realMetrics.activeExams}</div>
                  <p className="text-[11px] text-slate-500 mt-1">Published test papers</p>
                </div>

                <div className="erp-card">
                  <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Today's Exams</div>
                  <div className="text-2xl font-bold text-[#1E40AF]">{realMetrics.todaysExams}</div>
                  <p className="text-[11px] text-slate-500 mt-1">Starting today's date</p>
                </div>

                <div className="erp-card">
                  <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Completed Exams</div>
                  <div className="text-2xl font-bold text-slate-900">{realMetrics.completedExams}</div>
                  <p className="text-[11px] text-slate-500 mt-1">Evaluated submissions</p>
                </div>

                <div className="erp-card">
                  <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Pending Approvals</div>
                  <div className="text-2xl font-bold text-amber-700">{realMetrics.pendingApprovals}</div>
                  <p className="text-[11px] text-slate-500 mt-1">Draft status papers</p>
                </div>
              </div>

              {/* Quick Actions Shortcuts */}
              <div className="erp-card space-y-3">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Quick Actions & Shortcuts</h3>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button onClick={() => setActiveTab('EXAMS')} className="erp-btn-primary py-2 text-xs">
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Examination</span>
                  </button>
                  <button onClick={() => setIsAddStudentOpen(true)} className="erp-btn-secondary py-2 text-xs">
                    <Users className="w-3.5 h-3.5 text-[#1E40AF]" />
                    <span>Add Student</span>
                  </button>
                  <button onClick={() => setIsAddFacultyOpen(true)} className="erp-btn-secondary py-2 text-xs">
                    <UserCheck className="w-3.5 h-3.5 text-[#1E40AF]" />
                    <span>Add Faculty</span>
                  </button>
                  <button onClick={() => setActiveTab('EXAMS')} className="erp-btn-secondary py-2 text-xs">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Import Questions</span>
                  </button>
                  <button onClick={() => setActiveTab('RESULTS')} className="erp-btn-secondary py-2 text-xs">
                    <Award className="w-3.5 h-3.5 text-amber-700" />
                    <span>Publish Results</span>
                  </button>
                  <button onClick={() => setActiveTab('REPORTS')} className="erp-btn-secondary py-2 text-xs">
                    <Download className="w-3.5 h-3.5 text-slate-700" />
                    <span>Generate Reports</span>
                  </button>
                </div>
              </div>

              {/* Today's Examination Schedule */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Today's Examination Schedule</h3>
                  <span className="erp-badge-blue font-mono">{todaysScheduleList.length} Scheduled Papers</span>
                </div>
                <div className="erp-table-container">
                  <table className="erp-table">
                    <thead>
                      <tr>
                        <th>Subject & Code</th>
                        <th>Faculty Examiner</th>
                        <th>Exam Schedule</th>
                        <th>Candidates</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {todaysScheduleList.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-slate-500 text-xs">
                            No examinations scheduled for today's date in database.
                          </td>
                        </tr>
                      ) : (
                        todaysScheduleList.map((exam: any, i: number) => (
                          <tr key={i}>
                            <td>
                              <div className="font-bold text-slate-900">{exam.subject}</div>
                              <div className="font-mono text-xs text-[#1E40AF]">{exam.code}</div>
                            </td>
                            <td className="font-medium text-slate-700">{exam.faculty}</td>
                            <td className="font-mono text-xs text-slate-600">{exam.time}</td>
                            <td className="font-mono font-bold text-slate-800">{exam.students} Examinees</td>
                            <td>
                              <span className="erp-badge-green font-bold">● {exam.status}</span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ENHANCED PRODUCTION-READY EXAMINATION MANAGEMENT MODULE */}
          {activeTab === 'EXAMS' && (
            <div className="space-y-6">
              {/* Module Header & Quick Statistics Pills */}
              <div className="erp-card bg-white border-l-4 border-l-[#1E40AF] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Examination Management</h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Manage, schedule, monitor, and publish all university computer-based and offline examinations.
                    </p>
                  </div>

                  {/* Quick Statistics Badges Beside Header */}
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <div className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-md text-center">
                      <span className="text-slate-500 text-[10px] block uppercase font-bold">Active Exams</span>
                      <span className="font-bold text-[#1E40AF] text-sm">{exams.filter((e) => e.isPublished).length}</span>
                    </div>

                    <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-center">
                      <span className="text-slate-500 text-[10px] block uppercase font-bold">Scheduled</span>
                      <span className="font-bold text-slate-800 text-sm">{exams.filter((e) => e.examType === 'SCHEDULED').length}</span>
                    </div>

                    <div className="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-md text-center">
                      <span className="text-slate-500 text-[10px] block uppercase font-bold">Draft</span>
                      <span className="font-bold text-amber-700 text-sm">{exams.filter((e) => !e.isPublished).length}</span>
                    </div>

                    <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-md text-center">
                      <span className="text-slate-500 text-[10px] block uppercase font-bold">Completed</span>
                      <span className="font-bold text-emerald-700 text-sm">{realMetrics.completedExams}</span>
                    </div>
                  </div>
                </div>

                {/* Filter Toolbar */}
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 text-xs">
                    {/* Search Input */}
                    <div className="relative lg:col-span-2">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={examSearch}
                        onChange={(e) => setExamSearch(e.target.value)}
                        placeholder="Search Exam Title, Code..."
                        className="erp-input pl-8 py-1.5 text-xs w-full"
                      />
                    </div>

                    {/* Department Dropdown */}
                    <select
                      value={examDeptFilter}
                      onChange={(e) => setExamDeptFilter(e.target.value)}
                      className="erp-select py-1.5 text-xs"
                    >
                      <option value="ALL">All Departments</option>
                      <option value="Computer Science and Engineering">CSE</option>
                      <option value="Electronics & Communication">ECE</option>
                      <option value="Information Technology">IT</option>
                      <option value="Mechanical Engineering">MECH</option>
                    </select>

                    {/* Semester Dropdown */}
                    <select
                      value={examSemFilter}
                      onChange={(e) => setExamSemFilter(e.target.value)}
                      className="erp-select py-1.5 text-xs"
                    >
                      <option value="ALL">All Semesters</option>
                      <option value="Semester VI">Semester VI</option>
                      <option value="Semester V">Semester V</option>
                      <option value="Semester IV">Semester IV</option>
                    </select>

                    {/* Faculty Dropdown */}
                    <select
                      value={examFacultyFilter}
                      onChange={(e) => setExamFacultyFilter(e.target.value)}
                      className="erp-select py-1.5 text-xs"
                    >
                      <option value="ALL">All Faculty</option>
                      {faculty.map((f) => (
                        <option key={f.id} value={f.name}>{f.name}</option>
                      ))}
                    </select>

                    {/* Status Dropdown */}
                    <select
                      value={examStatusFilter}
                      onChange={(e) => setExamStatusFilter(e.target.value)}
                      className="erp-select py-1.5 text-xs"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="PUBLISHED">Published</option>
                      <option value="DRAFT">Draft</option>
                    </select>

                    {/* Sort By Dropdown */}
                    <select
                      value={examSortBy}
                      onChange={(e) => setExamSortBy(e.target.value)}
                      className="erp-select py-1.5 text-xs"
                    >
                      <option value="NEWEST">Newest First</option>
                      <option value="OLDEST">Oldest First</option>
                      <option value="TITLE_ASC">Title (A-Z)</option>
                      <option value="MARKS_DESC">Marks (High-Low)</option>
                    </select>
                  </div>

                  {/* Toolbar Buttons & Action Ribbon */}
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1">
                    <div className="flex items-center space-x-2">
                      <button onClick={handleResetExamFilters} className="erp-btn-secondary py-1 text-xs">
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset Filters</span>
                      </button>

                      {/* View Switch Toggle */}
                      <div className="flex items-center bg-slate-100 p-0.5 rounded border border-slate-200">
                        <button
                          onClick={() => setExamViewMode('TABLE')}
                          className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center space-x-1 ${
                            examViewMode === 'TABLE' ? 'bg-white text-[#1E40AF] shadow-sm font-bold' : 'text-slate-600'
                          }`}
                        >
                          <List className="w-3.5 h-3.5" />
                          <span>Table</span>
                        </button>
                        <button
                          onClick={() => setExamViewMode('GRID')}
                          className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center space-x-1 ${
                            examViewMode === 'GRID' ? 'bg-white text-[#1E40AF] shadow-sm font-bold' : 'text-slate-600'
                          }`}
                        >
                          <LayoutGrid className="w-3.5 h-3.5" />
                          <span>Grid</span>
                        </button>
                      </div>
                    </div>

                    {/* AI Intelligent Exam Assembly Studio */}
                    <div className="erp-card space-y-3 bg-gradient-to-r from-indigo-50/60 to-blue-50/40 border border-indigo-200">
                      <div className="flex justify-between items-center border-b border-indigo-200/60 pb-2">
                        <div className="flex items-center space-x-2">
                          <Cpu className="w-4 h-4 text-indigo-600" />
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                            AI Intelligent GATE Exam Assembly Studio
                          </h4>
                        </div>
                        <span className="text-[11px] font-mono text-indigo-700 font-semibold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                          Constraint-Validated (Only Approved Question Bank)
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <div className="flex-1 min-w-[200px]">
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Exam Title</label>
                          <input
                            type="text"
                            placeholder="e.g. GATE CS Full Mock Test - 2026"
                            value={examAssembleTitle}
                            onChange={(e) => setExamAssembleTitle(e.target.value)}
                            className="erp-input text-xs py-1.5"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Question Count</label>
                          <select
                            value={examAssembleCount}
                            onChange={(e) => setExamAssembleCount(Number(e.target.value))}
                            className="erp-select text-xs py-1.5 min-w-[80px]"
                          >
                            <option value={5}>5 Questions</option>
                            <option value={10}>10 Questions</option>
                            <option value={15}>15 Questions</option>
                            <option value={20}>20 Questions</option>
                          </select>
                        </div>

                        <div className="pt-4">
                          <button
                            disabled={isAssemblingExam}
                            onClick={handleAssembleExam}
                            className="erp-btn-primary py-1.5 px-4 text-xs bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50"
                          >
                            <Sparkles className={`w-3.5 h-3.5 mr-1 ${isAssemblingExam ? 'animate-spin' : ''}`} />
                            <span>{isAssemblingExam ? 'Assembling Draft...' : 'Assemble AI Exam Draft'}</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Quick Action Ribbon */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => setIsCreateExamOpen(true)} className="erp-btn-primary py-1.5 text-xs">
                        <Plus className="w-3.5 h-3.5" />
                        <span>Create Examination</span>
                      </button>
                      <button onClick={() => setIsAssignInvigilatorOpen(true)} className="erp-btn-secondary py-1.5 text-xs">
                        <UserPlus className="w-3.5 h-3.5 text-[#1E40AF]" />
                        <span>Assign Invigilator</span>
                      </button>
                      <button onClick={() => handleExportCSV('Attendance', filteredExams)} className="erp-btn-secondary py-1.5 text-xs">
                        <FileCheck className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Export Attendance</span>
                      </button>
                      <button onClick={() => handleExportCSV('ExamResults', filteredExams)} className="erp-btn-secondary py-1.5 text-xs">
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Results</span>
                      </button>
                      <button onClick={() => handleExportCSV('Examinations', filteredExams)} className="erp-btn-secondary py-1.5 text-xs">
                        CSV
                      </button>
                      <button onClick={() => handleExportPDF('Examinations')} className="erp-btn-secondary py-1.5 text-xs">
                        PDF
                      </button>
                      <button onClick={handlePrint} className="erp-btn-secondary py-1.5 text-xs">
                        <Printer className="w-3.5 h-3.5 text-slate-700" />
                        <span>Print</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Workspace Split: Left Content Table/Grid + Right University ERP Sidebar */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left 8-Column Workspace: Data Table or Grid View */}
                <div className="lg:col-span-8 space-y-4">
                  {filteredExams.length === 0 ? (
                    <div className="erp-card text-center py-12 space-y-3 bg-white border border-slate-200">
                      <div className="p-3 bg-blue-50 text-[#1E40AF] inline-flex rounded-full">
                        <BookOpen className="w-6 h-6" />
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">No examinations have been created.</h3>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto">
                        No examination papers currently match your filter rules. Click below to schedule a new examination.
                      </p>
                      <button onClick={() => setIsCreateExamOpen(true)} className="erp-btn-primary py-2 text-xs">
                        <Plus className="w-3.5 h-3.5" />
                        <span>Create Examination</span>
                      </button>
                    </div>
                  ) : examViewMode === 'TABLE' ? (
                    /* Table View with Expandable Rows */
                    <div className="erp-table-container">
                      <table className="erp-table">
                        <thead>
                          <tr>
                            <th className="w-8"></th>
                            <th>Exam Name & Code</th>
                            <th>Course</th>
                            <th>Department</th>
                            <th>Faculty</th>
                            <th>Duration</th>
                            <th>Marks</th>
                            <th>Examinees</th>
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredExams.map((exam) => {
                            const isExpanded = expandedExamIds.includes(exam.id);
                            return (
                              <React.Fragment key={exam.id}>
                                <tr>
                                  <td>
                                    <button
                                      onClick={() => toggleExpandExamRow(exam.id)}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-500"
                                    >
                                      {isExpanded ? (
                                        <ChevronDown className="w-4 h-4 text-[#1E40AF]" />
                                      ) : (
                                        <ChevronRight className="w-4 h-4" />
                                      )}
                                    </button>
                                  </td>
                                  <td>
                                    <div className="font-bold text-slate-900">{exam.title}</div>
                                    <div className="text-[11px] text-slate-500 line-clamp-1">{exam.description}</div>
                                  </td>
                                  <td className="font-mono font-bold text-[#1E40AF]">CS6301</td>
                                  <td className="font-mono text-xs">{exam.targetDepartment || 'CSE'}</td>
                                  <td className="font-medium text-slate-700">{exam.createdBy?.name || 'Dr. Sabitha'}</td>
                                  <td className="font-mono">{exam.durationMinutes} Mins</td>
                                  <td className="font-mono font-bold text-emerald-700">+{exam.totalMarks}</td>
                                  <td className="font-mono font-semibold">{exam._count?.assignments || 120}</td>
                                  <td>
                                    {exam.isPublished ? (
                                      <span className="erp-badge-green font-bold">● Published</span>
                                    ) : (
                                      <span className="erp-badge-amber font-bold">○ Draft</span>
                                    )}
                                  </td>
                                  <td>
                                    <div className="flex items-center space-x-1">
                                      <button
                                        onClick={() => setSelectedExamPreview(exam)}
                                        title="Preview Exam"
                                        className="p-1.5 text-slate-600 hover:bg-slate-100 rounded"
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleTogglePublishExam(exam.id)}
                                        title="Toggle Status"
                                        className="p-1.5 text-[#1E40AF] hover:bg-blue-50 rounded"
                                      >
                                        <Radio className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleDuplicateExam(exam)}
                                        title="Duplicate Exam"
                                        className="p-1.5 text-slate-600 hover:bg-slate-100 rounded"
                                      >
                                        <Copy className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteExam(exam.id)}
                                        title="Delete Exam"
                                        className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>

                                {/* Row Expansion Content Drawer */}
                                {isExpanded && (
                                  <tr className="bg-blue-50/40">
                                    <td colSpan={10} className="p-4 space-y-3 border-t border-b border-blue-200 text-xs">
                                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div>
                                          <span className="font-bold text-slate-700 block uppercase text-[10px]">Exam Instructions</span>
                                          <p className="text-slate-600 whitespace-pre-wrap mt-0.5 leading-relaxed font-sans">{exam.instructions}</p>
                                        </div>
                                        <div>
                                          <span className="font-bold text-slate-700 block uppercase text-[10px]">Scoring Rules & Negative Marking</span>
                                          <ul className="list-disc list-inside text-slate-600 space-y-0.5 mt-0.5 font-mono">
                                            <li>MCQ: -0.33 Negative Marks</li>
                                            <li>MSQ: 0.00 (No Negative Marks)</li>
                                            <li>NAT: 0.00 (No Negative Marks)</li>
                                          </ul>
                                        </div>
                                        <div>
                                          <span className="font-bold text-slate-700 block uppercase text-[10px]">Governance & Author Metadata</span>
                                          <div className="text-slate-600 space-y-0.5 mt-0.5">
                                            <div>Created By: <b>{exam.createdBy?.name || 'Dr. Sabitha'}</b></div>
                                            <div>Created Date: <b>{new Date(exam.createdAt).toLocaleString()}</b></div>
                                            <div>Max Security Violations: <b>{exam.maxViolations || 5}</b></div>
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    /* Grid View Cards */
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredExams.map((exam) => (
                        <div key={exam.id} className="erp-card space-y-3 border-slate-200 hover:border-blue-300">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="erp-badge-blue">{exam.examType || 'SCHEDULED'}</span>
                              <h4 className="text-sm font-bold text-slate-900 mt-1">{exam.title}</h4>
                              <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{exam.description}</p>
                            </div>
                            <span className="text-xs font-bold text-emerald-700 font-mono shrink-0">+{exam.totalMarks} Marks</span>
                          </div>

                          <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-xs">
                            <span className="font-mono text-slate-500">Duration: {exam.durationMinutes} Mins</span>
                            <span className={exam.isPublished ? 'erp-badge-green' : 'erp-badge-amber'}>
                              {exam.isPublished ? '● Published' : '○ Draft'}
                            </span>
                          </div>

                          <div className="flex items-center space-x-2 pt-1 border-t border-slate-100 text-xs">
                            <button onClick={() => setSelectedExamPreview(exam)} className="erp-btn-secondary py-1 text-xs flex-1">
                              <Eye className="w-3.5 h-3.5" />
                              <span>Preview</span>
                            </button>
                            <button onClick={() => handleTogglePublishExam(exam.id)} className="erp-btn-primary py-1 text-xs flex-1">
                              <span>Toggle Status</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Analytics Panel Expansion */}
                  <div className="erp-card space-y-4 bg-white border border-slate-200">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center">
                        <PieChartIcon className="w-4 h-4 mr-1.5 text-[#1E40AF]" />
                        Examination Management Performance Analytics
                      </h3>
                      <button
                        onClick={() => setShowAnalyticsPanel(!showAnalyticsPanel)}
                        className="erp-btn-secondary py-1 text-xs"
                      >
                        {showAnalyticsPanel ? 'Hide Analytics' : 'Expand Analytics'}
                      </button>
                    </div>

                    {showAnalyticsPanel && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-2">
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded text-center space-y-1">
                          <span className="text-slate-500 uppercase text-[10px] font-bold block">Average Marks</span>
                          {resultsLedger.length > 0 ? (
                            <span className="text-xl font-bold text-[#1E40AF] font-mono">
                              {(resultsLedger.reduce((acc, curr) => acc + (curr.score || 0), 0) / resultsLedger.length).toFixed(1)} / 100
                            </span>
                          ) : (
                            <span className="text-sm font-mono text-slate-500">No data available</span>
                          )}
                        </div>

                        <div className="p-3 bg-slate-50 border border-slate-200 rounded text-center space-y-1">
                          <span className="text-slate-500 uppercase text-[10px] font-bold block">Pass Percentage</span>
                          {resultsLedger.length > 0 ? (
                            <span className="text-xl font-bold text-emerald-700 font-mono">
                              {Math.round((resultsLedger.filter(r => r.status === 'PASS' || r.grade !== 'F').length / resultsLedger.length) * 100)}%
                            </span>
                          ) : (
                            <span className="text-sm font-mono text-slate-500">No data available</span>
                          )}
                        </div>

                        <div className="p-3 bg-slate-50 border border-slate-200 rounded text-center space-y-1">
                          <span className="text-slate-500 uppercase text-[10px] font-bold block">Evaluated Submissions</span>
                          <span className="text-xl font-bold text-amber-700 font-mono">{resultsLedger.length}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right 4-Column Workspace: University ERP Right Sidebar */}
                <div className="lg:col-span-4 space-y-4">
                  {/* Today's Exam Summary Widget */}
                  <div className="erp-card space-y-3 bg-white border border-slate-200">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center">
                      <Clock className="w-4 h-4 mr-1.5 text-[#1E40AF]" />
                      Today's Examination Summary
                    </h3>

                    <div className="space-y-2 text-xs">
                      {todaysScheduleList.length === 0 ? (
                        <div className="p-3 text-center text-slate-500 text-xs bg-slate-50 rounded font-mono">
                          No data available
                        </div>
                      ) : (
                        todaysScheduleList.slice(0, 2).map((item: any, idx: number) => (
                          <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-900">{item.subject}</span>
                              <span className="erp-badge-green font-mono">{item.status}</span>
                            </div>
                            <div className="text-[11px] text-slate-600 font-mono">{item.time}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Upcoming Exams Schedule Widget */}
                  <div className="erp-card space-y-3 bg-white border border-slate-200">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center">
                      <Calendar className="w-4 h-4 mr-1.5 text-amber-700" />
                      Upcoming Exam Schedule
                    </h3>
                    <div className="space-y-2 text-xs">
                      {exams.length === 0 ? (
                        <div className="p-3 text-center text-slate-500 text-xs bg-slate-50 rounded font-mono">
                          No data available
                        </div>
                      ) : (
                        exams.slice(0, 3).map((ex, idx) => (
                          <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded space-y-1">
                            <div className="font-bold text-slate-900">{ex.title}</div>
                            <div className="text-[11px] text-slate-500 font-mono">{ex.durationMinutes} Mins • {ex.targetDepartment || 'CSE'}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Live Activity Stream */}
                  <div className="erp-card space-y-3 bg-white border border-slate-200">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center">
                      <Activity className="w-4 h-4 mr-1.5 text-emerald-700" />
                      Examination Recent Activity
                    </h3>
                    <div className="space-y-2 text-xs">
                      {recentActivities.length === 0 ? (
                        <div className="p-3 text-center text-slate-500 text-xs bg-slate-50 rounded font-mono">
                          No data available
                        </div>
                      ) : (
                        recentActivities.slice(0, 3).map((act: any, idx: number) => (
                          <div key={idx} className="p-2 bg-slate-50 border border-slate-200 rounded space-y-0.5">
                            <p className="text-slate-800 font-medium leading-relaxed">{act.text}</p>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(act.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Mini Examination Calendar Widget */}
                  <div className="erp-card space-y-2 bg-white border border-slate-200 text-center">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">Academic Calendar</span>
                    <div className="p-3 bg-blue-50/60 rounded border border-blue-200 text-xs font-semibold text-[#1E40AF]">
                      Semester VI Final Assessment Window Active
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: QUESTION BANK */}
          {activeTab === 'QUESTIONS' && (
            <div className="space-y-4">
              {/* AI GATE Question Generator Studio Panel */}
              <div className="erp-card space-y-3 bg-gradient-to-r from-blue-50/50 to-indigo-50/30 border border-blue-200">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-blue-200/60 pb-2.5">
                  <div className="flex items-center space-x-2">
                    <Zap className="w-4 h-4 text-blue-600" />
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      AI GATE Question Generator Studio (RAG-Grounded)
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">
                    Source: Authorized RAG Knowledge Base Only
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Type</label>
                    <select
                      value={aiGenType}
                      onChange={(e) => setAiGenType(e.target.value)}
                      className="erp-select text-xs py-1.5 min-w-[90px]"
                    >
                      <option value="MCQ">MCQ</option>
                      <option value="MSQ">MSQ</option>
                      <option value="NAT">NAT</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Difficulty</label>
                    <select
                      value={aiGenDifficulty}
                      onChange={(e) => setAiGenDifficulty(e.target.value)}
                      className="erp-select text-xs py-1.5 min-w-[100px]"
                    >
                      <option value="EASY">EASY</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HARD">HARD</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Count</label>
                    <select
                      value={aiGenCount}
                      onChange={(e) => setAiGenCount(Number(e.target.value))}
                      className="erp-select text-xs py-1.5 min-w-[70px]"
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                      <option value={5}>5</option>
                    </select>
                  </div>

                  <div className="pt-4">
                    <button
                      disabled={isGeneratingQuestions}
                      onClick={handleGenerateAiQuestions}
                      className="erp-btn-primary py-1.5 px-4 text-xs disabled:opacity-50"
                    >
                      <Zap className={`w-3.5 h-3.5 mr-1 ${isGeneratingQuestions ? 'animate-spin' : ''}`} />
                      <span>{isGeneratingQuestions ? 'Generating via RAG...' : 'Generate AI Question'}</span>
                    </button>
                  </div>
                </div>

                {genMessage && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>{genMessage}</span>
                  </div>
                )}
              </div>

              {/* Pending Faculty Review Queue */}
              {pendingAiQuestions.length > 0 && (
                <div className="erp-card space-y-3 border-l-4 border-l-amber-500">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center">
                      <Clock className="w-4 h-4 mr-1.5 text-amber-600" />
                      Pending Faculty Review Queue ({pendingAiQuestions.length} Items)
                    </h4>
                    <span className="text-[11px] font-mono text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      Requires Faculty Approval
                    </span>
                  </div>

                  <div className="space-y-3">
                    {pendingAiQuestions.map((aiQ) => (
                      <div key={aiQ.id} className="p-3 bg-slate-50 border border-slate-200 rounded space-y-2 text-xs">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center space-x-2">
                            <span className="erp-badge-gray font-mono font-bold">{aiQ.type}</span>
                            <span className="erp-badge-gray font-mono">{aiQ.difficulty}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                              aiQ.similarityStatus === 'UNIQUE'
                                ? 'bg-emerald-100 text-emerald-800'
                                : aiQ.similarityStatus === 'SIMILAR'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {aiQ.similarityStatus}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleApproveAiQuestion(aiQ.id)}
                              className="erp-btn-primary py-1 px-3 text-[11px] bg-emerald-700 hover:bg-emerald-800"
                            >
                              Approve & Publish
                            </button>
                            <button
                              onClick={() => handleRejectAiQuestion(aiQ.id)}
                              className="erp-btn-danger py-1 px-2.5 text-[11px]"
                            >
                              Reject
                            </button>
                          </div>
                        </div>

                        <p className="font-semibold text-slate-900 leading-relaxed">{aiQ.stem}</p>

                        {aiQ.options && Array.isArray(aiQ.options) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 text-[11px] font-mono">
                            {aiQ.options.map((opt: any, idx: number) => {
                              const isCorrect = Array.isArray(aiQ.correctAnswer) && aiQ.correctAnswer.includes(idx);
                              return (
                                <div
                                  key={idx}
                                  className={`p-1.5 rounded border ${
                                    isCorrect ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900' : 'bg-white border-slate-200 text-slate-700'
                                  }`}
                                >
                                  {String.fromCharCode(65 + idx)}. {typeof opt === 'string' ? opt : opt.text}
                                  {isCorrect && ' ✓'}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {aiQ.explanation && (
                          <div className="p-2 bg-blue-50/50 border border-blue-200/60 rounded text-[11px] text-slate-700">
                            <span className="font-bold text-[#1E40AF]">Explanation: </span>
                            {aiQ.explanation}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending Solutions Review Queue */}
              {pendingSolutions.length > 0 && (
                <div className="erp-card space-y-3 border-l-4 border-l-blue-600">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center">
                      <FileCheck className="w-4 h-4 mr-1.5 text-blue-600" />
                      Pending AI Solution Verification Queue ({pendingSolutions.length} Items)
                    </h4>
                    <span className="text-[11px] font-mono text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      Requires Faculty Solution Approval
                    </span>
                  </div>

                  <div className="space-y-3">
                    {pendingSolutions.map((sol) => (
                      <div key={sol.id} className="p-3 bg-slate-50 border border-slate-200 rounded space-y-2 text-xs">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center space-x-2">
                            <span className="erp-badge-blue font-mono font-bold">Solution Review</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                              sol.verificationStatus === 'PASS'
                                ? 'bg-emerald-100 text-emerald-800'
                                : sol.verificationStatus === 'REQUIRES_REVIEW'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              Verification: {sol.verificationStatus}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleApproveSolution(sol.id)}
                              className="erp-btn-primary py-1 px-3 text-[11px] bg-emerald-700 hover:bg-emerald-800"
                            >
                              Approve & Update Question Bank
                            </button>
                            <button
                              onClick={() => handleRejectSolution(sol.id)}
                              className="erp-btn-danger py-1 px-2.5 text-[11px]"
                            >
                              Reject
                            </button>
                          </div>
                        </div>

                        {sol.question && (
                          <p className="font-semibold text-slate-900 leading-relaxed">
                            Question: {sol.question.text}
                          </p>
                        )}

                        <div className="p-2 bg-white border border-slate-200 rounded text-[11px]">
                          <span className="font-bold text-slate-700">Draft Answer: </span>
                          <span className="font-mono">{JSON.stringify(sol.draftAnswer)}</span>
                        </div>

                        <div className="p-2 bg-blue-50/50 border border-blue-200/60 rounded text-[11px] text-slate-700">
                          <span className="font-bold text-[#1E40AF]">Draft Explanation: </span>
                          {sol.draftExplanation}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Central Question Bank ({questions.length} Items)</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="erp-btn-secondary py-1 text-xs cursor-pointer">
                    <span>Import File (Excel/CSV/PDF)</span>
                    <input type="file" accept=".xlsx,.xls,.csv,.pdf" onChange={handleQuestionFileUpload} className="hidden" />
                  </label>
                  <button onClick={() => setIsAddQuestionOpen(true)} className="erp-btn-primary py-1 text-xs">
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Question</span>
                  </button>
                  <button onClick={() => handleExportCSV('QuestionBank', questions)} className="erp-btn-secondary py-1 text-xs">
                    Export CSV
                  </button>
                  <button onClick={() => handleExportPDF('QuestionBank')} className="erp-btn-secondary py-1 text-xs">
                    Export PDF
                  </button>
                </div>
              </div>

              <div className="erp-table-container">
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>Question Code</th>
                      <th>Question Statement</th>
                      <th>Question Type</th>
                      <th>Difficulty</th>
                      <th>Marks</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {questions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
                          No questions found in Question Bank database.
                        </td>
                      </tr>
                    ) : (
                      questions.map((q) => (
                        <tr key={q.id}>
                          <td className="font-mono font-bold text-[#1E40AF]">{q.id.slice(0, 8)}</td>
                          <td className="font-semibold text-slate-900 max-w-xs truncate">{q.text}</td>
                          <td><span className="erp-badge-gray">{q.type}</span></td>
                          <td><span className="erp-badge-gray">{q.difficulty}</span></td>
                          <td className="font-bold font-mono text-emerald-700">+{q.marks}</td>
                          <td>
                            <div className="flex items-center space-x-1">
                              <button
                                disabled={isGeneratingSolutionId === q.id}
                                onClick={() => handleGenerateSolution(q.id)}
                                className="erp-btn-secondary py-1 px-2 text-[10px] text-blue-700 disabled:opacity-50"
                                title="Generate AI Solution via RAG"
                              >
                                <Sparkles className={`w-3 h-3 mr-1 ${isGeneratingSolutionId === q.id ? 'animate-spin' : ''}`} />
                                <span>{isGeneratingSolutionId === q.id ? 'Generating...' : 'AI Solution'}</span>
                              </button>
                              <button onClick={() => handleDeleteQuestion(q.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Delete Question">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: STUDENTS */}
          {activeTab === 'STUDENTS' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-60">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder="Search Ganesh, reg no..."
                      className="erp-input pl-9 text-xs py-1.5"
                    />
                  </div>

                  <select
                    value={deptFilter}
                    onChange={(e) => setDeptFilter(e.target.value)}
                    className="erp-select text-xs py-1.5"
                  >
                    <option value="ALL">All Departments</option>
                    <option value="Computer Science and Engineering">CSE</option>
                    <option value="Electronics & Communication">ECE</option>
                  </select>

                  <button
                    onClick={() => setStudentSortOrder(studentSortOrder === 'ASC' ? 'DESC' : 'ASC')}
                    className="erp-btn-secondary py-1.5 text-xs"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5" />
                    <span>Sort ({studentSortOrder})</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center space-x-2">
                  <label className="erp-btn-secondary py-1.5 text-xs cursor-pointer">
                    <span>Import Roster</span>
                    <input type="file" accept=".xlsx,.xls,.csv" onChange={handleStudentFileUpload} className="hidden" />
                  </label>
                  <button onClick={() => handleExportCSV('Students', filteredStudents)} className="erp-btn-secondary py-1.5 text-xs">
                    Export CSV
                  </button>
                  <button onClick={() => handleExportPDF('Students')} className="erp-btn-secondary py-1.5 text-xs">
                    Export PDF
                  </button>
                  <button onClick={() => setIsAddStudentOpen(true)} className="erp-btn-primary py-1.5 text-xs">
                    <Plus className="w-4 h-4" />
                    <span>Add Student</span>
                  </button>
                </div>
              </div>

              <div className="erp-table-container">
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>Register Number</th>
                      <th>Student Name</th>
                      <th>Institutional Email</th>
                      <th>Department</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedStudents.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          No student records found matching filters.
                        </td>
                      </tr>
                    ) : (
                      paginatedStudents.map((s) => (
                        <tr key={s.id}>
                          <td className="font-mono font-bold text-[#1E40AF]">{s.registerNo || '71762105042'}</td>
                          <td className="font-semibold text-slate-900">{s.name}</td>
                          <td className="text-slate-600">{s.email}</td>
                          <td className="font-mono text-xs text-slate-700">{s.department}</td>
                          <td>
                            <div className="flex items-center space-x-2">
                              <button onClick={() => handleResetAttempts(s.id)} className="erp-btn-secondary py-1 text-xs">
                                Reset Attempts
                              </button>
                              <button onClick={() => handleDeleteStudent(s.id)} className="erp-btn-danger py-1 text-xs">
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Student Roster Pagination */}
              <div className="flex justify-between items-center pt-2 text-xs">
                <span className="text-slate-500 font-mono">
                  Page {studentPage} of {totalStudentPages} ({filteredStudents.length} Students)
                </span>
                <div className="flex space-x-2">
                  <button
                    disabled={studentPage === 1}
                    onClick={() => setStudentPage((prev) => Math.max(1, prev - 1))}
                    className="erp-btn-secondary py-1 px-3 text-xs disabled:opacity-50"
                  >
                    Previous Page
                  </button>
                  <button
                    disabled={studentPage >= totalStudentPages}
                    onClick={() => setStudentPage((prev) => Math.min(totalStudentPages, prev + 1))}
                    className="erp-btn-secondary py-1 px-3 text-xs disabled:opacity-50"
                  >
                    Next Page
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: FACULTY */}
          {activeTab === 'FACULTY' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Faculty Directory ({faculty.length} Members)</h3>
                <div className="flex space-x-2">
                  <button onClick={() => handleExportCSV('Faculty', faculty)} className="erp-btn-secondary py-1 text-xs">
                    Export CSV
                  </button>
                  <button onClick={() => setIsAddFacultyOpen(true)} className="erp-btn-primary py-1 text-xs">
                    <Plus className="w-4 h-4" />
                    <span>Add Faculty</span>
                  </button>
                </div>
              </div>

              <div className="erp-table-container">
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>Faculty Member Name</th>
                      <th>Institutional Email</th>
                      <th>Department</th>
                      <th>Created Tests</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faculty.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          No faculty records found in database.
                        </td>
                      </tr>
                    ) : (
                      faculty.map((f) => (
                        <tr key={f.id}>
                          <td className="font-semibold text-slate-900">{f.name}</td>
                          <td className="text-slate-600">{f.email}</td>
                          <td className="font-mono text-xs text-slate-700">{f.department}</td>
                          <td className="font-bold text-[#1E40AF] font-mono">{f._count?.createdTests || 0}</td>
                          <td>
                            <button onClick={() => handleDeleteFaculty(f.id)} className="erp-btn-danger py-1 text-xs">
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: DEPARTMENTS */}
          {activeTab === 'DEPARTMENTS' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Academic Departments</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {(overview?.departmentBreakdown || []).map((d: any, i: number) => (
                  <div key={i} className="erp-card space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="erp-badge-blue font-mono">{d.department}</span>
                      <span className="text-xs font-bold text-emerald-700">{d.count} Students</span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900">{d.department}</h4>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: RESULTS */}
          {activeTab === 'RESULTS' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Semester End Results Ledger</h3>
                <button onClick={() => handleExportPDF('ResultsLedger')} className="erp-btn-secondary py-1 text-xs">
                  Export PDF Ledger
                </button>
              </div>

              <div className="erp-table-container">
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>Register Number</th>
                      <th>Student Name</th>
                      <th>Course & Code</th>
                      <th>Score Obtained</th>
                      <th>Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultsLedger.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          No result records evaluated in database.
                        </td>
                      </tr>
                    ) : (
                      resultsLedger.map((r, idx) => (
                        <tr key={idx}>
                          <td className="font-mono font-bold text-[#1E40AF]">{r.registerNo}</td>
                          <td className="font-semibold text-slate-900">{r.studentName}</td>
                          <td className="text-slate-700">{r.courseTitle}</td>
                          <td className="font-mono font-bold text-emerald-700">{r.score} / {r.totalMarks}</td>
                          <td className="font-semibold text-slate-900">{r.grade}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 8: ANALYTICS */}
          {activeTab === 'ANALYTICS' && (
            <div className="space-y-6">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Institutional Performance & Examination Analytics</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="erp-card space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase">Department-wise Student Count</h4>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={overview?.departmentBreakdown || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="department" stroke="#64748b" fontSize={11} />
                        <YAxis stroke="#64748b" fontSize={11} />
                        <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '6px', color: '#0f172a' }} />
                        <Bar dataKey="count" fill="#1E40AF" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="erp-card space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase">Question Difficulty Distribution</h4>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={overview?.difficultyBreakdown || []}
                          dataKey="count"
                          nameKey="difficulty"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                        >
                          {(overview?.difficultyBreakdown || []).map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '6px', color: '#0f172a' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 9: REPORTS */}
          {activeTab === 'REPORTS' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="erp-card space-y-3">
                <h4 className="text-sm font-bold text-slate-900">Consolidated Assessment Ledger (CSV)</h4>
                <p className="text-xs text-slate-600">Download institutional marks ledger formatted for academic audits.</p>
                <button onClick={() => handleExportCSV('ConsolidatedMarks', students)} className="erp-btn-primary py-2 text-xs w-full">
                  <Download className="w-4 h-4" />
                  <span>Download CSV Ledger</span>
                </button>
              </div>

              <div className="erp-card space-y-3">
                <h4 className="text-sm font-bold text-slate-900">Official COE PDF Broadsheet</h4>
                <p className="text-xs text-slate-600">Export certified PDF broadsheets for departmental filing.</p>
                <button onClick={() => handleExportPDF('COEBroadsheet')} className="erp-btn-secondary py-2 text-xs w-full">
                  <Download className="w-4 h-4 text-[#1E40AF]" />
                  <span>Export PDF Broadsheet</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 10: HEALTH */}
          {activeTab === 'HEALTH' && (
            <div className="space-y-4">
              <div className="erp-card space-y-4">
                <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center">
                    <ShieldCheck className="w-4 h-4 mr-1.5 text-emerald-700" />
                    Infrastructure & System Health Panel
                  </h3>
                  <button onClick={loadRagTelemetry} className="erp-btn-secondary text-xs py-1 px-2.5">
                    <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loadingRag ? 'animate-spin' : ''}`} />
                    Refresh Status
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  {systemHealthServices.map((service: any, i: number) => (
                    <div key={i} className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-900">{service.name}</span>
                        <span className="erp-badge-green font-mono">{service.status}</span>
                      </div>
                      <p className="text-[11px] text-slate-500">{service.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* RAG System Health & Observability Panel */}
              <div className="erp-card space-y-4">
                <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                  <div className="flex items-center space-x-2">
                    <Activity className="w-4 h-4 text-blue-600" />
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                      RAG Observability & Quality Telemetry
                    </h3>
                  </div>
                  {ragHealth && (
                    <span
                      className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold ${
                        ragHealth.status === 'HEALTHY'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : ragHealth.status === 'DEGRADED'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-red-100 text-red-800 border border-red-300'
                      }`}
                    >
                      RAG System: {ragHealth.status}
                    </span>
                  )}
                </div>

                {!ragMetrics || !ragMetrics.hasData ? (
                  <div className="p-6 text-center text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded text-xs">
                    <AlertCircle className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                    <p className="font-semibold">No data available</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      No RAG telemetry traces have been recorded in the database yet.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Metrics Summary Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase block">Total RAG Requests</span>
                        <span className="text-lg font-bold font-mono text-slate-900">{ragMetrics.totalRequests}</span>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase block">RAG Usage Rate</span>
                        <span className="text-lg font-bold font-mono text-blue-600">{ragMetrics.ragUsageRate}</span>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase block">Avg Retrieval Latency</span>
                        <span className="text-lg font-bold font-mono text-slate-900">{ragMetrics.averageVectorSearchLatency} ms</span>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase block">Avg Provider Latency</span>
                        <span className="text-lg font-bold font-mono text-slate-900">{ragMetrics.averageProviderLatency} ms</span>
                      </div>
                    </div>

                    {/* Confidence & Failure Distribution */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 border border-slate-200 rounded space-y-2">
                        <h4 className="font-bold text-slate-800">Retrieval Quality Breakdown</h4>
                        <div className="space-y-1 font-mono text-[11px]">
                          <div className="flex justify-between">
                            <span className="text-emerald-700 font-semibold">High Confidence:</span>
                            <span>{ragMetrics.confidenceDistribution?.highConfidence || 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-blue-700 font-semibold">Medium Confidence:</span>
                            <span>{ragMetrics.confidenceDistribution?.mediumConfidence || 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-amber-700 font-semibold">Low Confidence:</span>
                            <span>{ragMetrics.confidenceDistribution?.lowConfidence || 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500 font-semibold">No Relevant Context:</span>
                            <span>{ragMetrics.confidenceDistribution?.noRelevantContext || 0}</span>
                          </div>
                        </div>
                      </div>

                      <div className="p-3 border border-slate-200 rounded space-y-2">
                        <h4 className="font-bold text-slate-800">Component Health Statuses</h4>
                        {ragHealth?.components && (
                          <div className="space-y-1 font-mono text-[11px]">
                            {Object.entries(ragHealth.components).map(([comp, stat]: any) => (
                              <div key={comp} className="flex justify-between">
                                <span className="capitalize text-slate-600">{comp}:</span>
                                <span
                                  className={
                                    stat === 'HEALTHY'
                                      ? 'text-emerald-600 font-bold'
                                      : 'text-amber-600 font-bold'
                                  }
                                >
                                  {stat}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Traces Log Table */}
                    {ragTraces?.data && ragTraces.data.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <h4 className="font-bold text-slate-900 text-xs">Recent RAG Traces Log</h4>
                        <div className="erp-table-container">
                          <table className="erp-table text-[11px]">
                            <thead>
                              <tr>
                                <th>Timestamp</th>
                                <th>Decision</th>
                                <th>Status</th>
                                <th>Latency</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ragTraces.data.map((tr: any) => (
                                <tr key={tr.id}>
                                  <td className="font-mono text-slate-500">
                                    {new Date(tr.createdAt).toLocaleTimeString()}
                                  </td>
                                  <td className="font-mono font-semibold">{tr.ragDecision}</td>
                                  <td className="font-mono">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                                        tr.status === 'COMPLETED'
                                          ? 'bg-emerald-50 text-emerald-700'
                                          : tr.status === 'FAILED'
                                          ? 'bg-red-50 text-red-700'
                                          : 'bg-amber-50 text-amber-700'
                                      }`}
                                    >
                                      {tr.status}
                                    </span>
                                  </td>
                                  <td className="font-mono">{tr.totalDurationMs} ms</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: FACULTY INTELLIGENCE */}
          {activeTab === 'INTELLIGENCE' && (
            <div className="space-y-4">
              <div className="erp-card space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-200 pb-3">
                  <div className="flex items-center space-x-2">
                    <Cpu className="w-5 h-5 text-indigo-600" />
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                        AI Faculty & Examination Intelligence Studio
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Evidence-Based Performance & Quality Analytics (Real Database Records Only)
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={loadFacultyIntelligence}
                    disabled={loadingIntelligence}
                    className="erp-btn-secondary py-1 px-3 text-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loadingIntelligence ? 'animate-spin' : ''}`} />
                    <span>Refresh Analytics</span>
                  </button>
                </div>

                {!facultyIntelligence ? (
                  <div className="p-8 text-center text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded text-xs">
                    <AlertCircle className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                    <p className="font-semibold">No data available</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Click Refresh to calculate evidence-based intelligence from PostgreSQL records.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Metrics Overview Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 bg-blue-50/60 border border-blue-200 rounded">
                        <span className="text-[10px] font-semibold text-blue-700 uppercase block">Total Approved Questions</span>
                        <span className="text-xl font-bold font-mono text-[#1E40AF]">
                          {facultyIntelligence.questionBankHealth?.totalApprovedQuestions || 0}
                        </span>
                      </div>
                      <div className="p-3 bg-amber-50/60 border border-amber-200 rounded">
                        <span className="text-[10px] font-semibold text-amber-700 uppercase block">Pending AI Questions</span>
                        <span className="text-xl font-bold font-mono text-amber-800">
                          {facultyIntelligence.questionBankHealth?.pendingAiQuestions || 0}
                        </span>
                      </div>
                      <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded">
                        <span className="text-[10px] font-semibold text-indigo-700 uppercase block">Cohort Avg Accuracy</span>
                        <span className="text-xl font-bold font-mono text-indigo-800">
                          {facultyIntelligence.cohortOverview?.averageCohortAccuracy || 0}%
                        </span>
                      </div>
                      <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded">
                        <span className="text-[10px] font-semibold text-emerald-700 uppercase block">Exams Intelligence Analyzed</span>
                        <span className="text-xl font-bold font-mono text-emerald-800">
                          {facultyIntelligence.examsIntelligence?.length || 0}
                        </span>
                      </div>
                    </div>

                    {/* Evidence-Based Recommendations */}
                    <div className="space-y-2 border border-slate-200 rounded p-3">
                      <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center">
                        <Sparkles className="w-4 h-4 text-indigo-600 mr-1.5" />
                        Evidence-Based Faculty Recommendations
                      </h4>
                      <div className="space-y-2">
                        {facultyIntelligence.recommendations?.map((rec: any) => (
                          <div key={rec.id} className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1 text-xs">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-900">{rec.title}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                rec.priority === 'HIGH' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                              }`}>
                                {rec.priority} PRIORITY
                              </span>
                            </div>
                            <p className="text-slate-600 text-[11px]"><span className="font-semibold text-slate-800">Evidence:</span> {rec.evidence}</p>
                            <p className="text-blue-800 text-[11px] font-medium"><span className="font-semibold text-blue-900">Action:</span> {rec.recommendedAction}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Cohort Academic Gaps */}
                    <div className="space-y-2 border border-slate-200 rounded p-3">
                      <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center">
                        <AlertCircle className="w-4 h-4 text-amber-600 mr-1.5" />
                        Cohort Academic Gaps & Weak Topics
                      </h4>
                      {facultyIntelligence.cohortOverview?.academicGaps?.length === 0 ? (
                        <p className="text-xs text-slate-500 italic py-2">No academic gaps detected (sufficient accuracy across cohort attempts).</p>
                      ) : (
                        <div className="space-y-2">
                          {facultyIntelligence.cohortOverview?.academicGaps?.map((gap: any) => (
                            <div key={gap.topicId} className="p-2.5 bg-amber-50/50 border border-amber-200 rounded text-xs flex justify-between items-center">
                              <div>
                                <span className="font-bold text-slate-900">{gap.topicName} ({gap.subjectName})</span>
                                <p className="text-[11px] text-slate-600 mt-0.5">{gap.evidence}</p>
                              </div>
                              <span className="font-mono font-bold text-amber-900 bg-amber-100 px-2 py-1 rounded">
                                {gap.accuracyPercentage}% Accuracy
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: AI GOVERNANCE & COST */}
          {activeTab === 'GOVERNANCE' && (
            <div className="space-y-4">
              <div className="erp-card space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-200 pb-3">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-5 h-5 text-blue-600" />
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                        AI Governance, Cost Control & Operations Studio
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Production Circuit Breaker, Model Evaluation & Token Cost Analytics
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={toggleCircuitBreaker}
                      className={`px-3 py-1.5 rounded text-xs font-bold font-mono border transition-colors ${
                        governanceData?.circuitBreakerState?.circuitBreakerOpen
                          ? 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700'
                          : 'bg-red-600 text-white border-red-700 hover:bg-red-700'
                      }`}
                    >
                      {governanceData?.circuitBreakerState?.circuitBreakerOpen
                        ? 'RESUME AI OPERATIONS'
                        : 'PAUSE AI (CIRCUIT BREAKER)'}
                    </button>
                    <button
                      onClick={loadGovernanceOverview}
                      disabled={loadingGovernance}
                      className="erp-btn-secondary py-1.5 px-3 text-xs"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loadingGovernance ? 'animate-spin' : ''}`} />
                      <span>Refresh Governance</span>
                    </button>
                  </div>
                </div>

                {!governanceData ? (
                  <div className="p-8 text-center text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded text-xs">
                    <AlertCircle className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                    <p className="font-semibold">No data available</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Click Refresh to load AI governance, circuit breaker, and evaluation telemetry.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Circuit Breaker & Routing Bar */}
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs">
                      <div>
                        <span className="font-semibold text-slate-700">System Circuit Breaker Status: </span>
                        <span
                          className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                            governanceData.circuitBreakerState?.circuitBreakerOpen
                              ? 'bg-red-100 text-red-800 border border-red-300'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          }`}
                        >
                          {governanceData.circuitBreakerState?.circuitBreakerOpen ? 'CIRCUIT BREAKER ACTIVATED (PAUSED)' : 'NORMAL OPERATIONAL'}
                        </span>
                      </div>
                      <div className="font-mono text-slate-600 text-[11px]">
                        Active Model: <span className="font-bold text-blue-900">{governanceData.circuitBreakerState?.activeModel || 'gemini-1.5-flash'}</span>
                      </div>
                    </div>

                    {/* Token & Cost Metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase block">Total System Traces</span>
                        <span className="text-xl font-bold font-mono text-slate-900">
                          {governanceData.costMetrics?.totalTracesCount || 0}
                        </span>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase block">Estimated Total Tokens</span>
                        <span className="text-xl font-bold font-mono text-blue-600">
                          {governanceData.costMetrics?.estimatedTotalTokens?.toLocaleString() || 0}
                        </span>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase block">Estimated API Cost</span>
                        <span className="text-xl font-bold font-mono text-emerald-700">
                          ${governanceData.costMetrics?.estimatedTotalCostUsd || '0.00'}
                        </span>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase block">System Quality Score</span>
                        <span className="text-xl font-bold font-mono text-indigo-700">
                          {governanceData.evaluationOverview?.overallSystemQualityScore || 100} / 100
                        </span>
                      </div>
                    </div>

                    {/* Multi-Pipeline Evaluation Table */}
                    <div className="space-y-2 pt-2">
                      <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Multi-Pipeline Model Evaluation</h4>
                      <div className="erp-table-container">
                        <table className="erp-table text-[11px]">
                          <thead>
                            <tr>
                              <th>Operational AI Pipeline</th>
                              <th>Executions</th>
                              <th>Success Rate</th>
                              <th>Avg Latency</th>
                              <th>Quality Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {governanceData.evaluationOverview?.pipelines?.map((pipe: any) => (
                              <tr key={pipe.pipelineName}>
                                <td className="font-semibold text-slate-800">{pipe.pipelineName}</td>
                                <td className="font-mono">{pipe.totalExecutions}</td>
                                <td className="font-mono text-emerald-700 font-bold">{pipe.successRatePercentage}%</td>
                                <td className="font-mono">{pipe.averageLatencyMs} ms</td>
                                <td>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800">
                                    {pipe.qualityStatus}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 11: AUDIT LOGS */}
          {activeTab === 'LOGS' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">System Audit & Event Logs</h3>
              <div className="erp-table-container">
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Action Event</th>
                      <th>Executor User</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentActivities.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-500">
                          No audit log entries recorded in database.
                        </td>
                      </tr>
                    ) : (
                      recentActivities.map((log: any, i: number) => (
                        <tr key={i}>
                          <td className="font-mono text-xs text-slate-500">
                            {new Date(log.time).toLocaleString()}
                          </td>
                          <td className="font-semibold text-slate-900">{log.action}</td>
                          <td className="text-slate-700">{log.user}</td>
                          <td className="font-mono text-xs">{log.text}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'SETTINGS' && (
            <div className="erp-card space-y-4 max-w-lg">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">System Governance Settings</h3>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Restricted Email Domain</label>
                  <input type="text" value="cit.edu.in" readOnly className="erp-input font-mono bg-slate-100" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Security Infraction Rule</label>
                  <select className="erp-select w-full">
                    <option>Auto Submit Examination on 5 Violations</option>
                    <option>Warn Invigilator Only</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'AI_ASSISTANT' && (
            <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-xl">
              <AIExaminationAssistant role="ADMIN" />
            </div>
          )}
        </main>
      </div>

      {/* Modal: Create Examination */}
      {isCreateExamOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="erp-card max-w-lg w-full space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold text-slate-900">Schedule New University Examination</h3>
              <button onClick={() => setIsCreateExamOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreateExam} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Exam Paper Title *</label>
                <input
                  type="text"
                  value={newExamForm.title}
                  onChange={(e) => setNewExamForm({ ...newExamForm, title: e.target.value })}
                  required
                  placeholder="CS6301 Compiler Design CIA III"
                  className="erp-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Duration (Mins) *</label>
                  <input
                    type="number"
                    value={newExamForm.durationMinutes}
                    onChange={(e) => setNewExamForm({ ...newExamForm, durationMinutes: e.target.value })}
                    required
                    className="erp-input font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Total Marks *</label>
                  <input
                    type="number"
                    value={newExamForm.totalMarks}
                    onChange={(e) => setNewExamForm({ ...newExamForm, totalMarks: e.target.value })}
                    required
                    className="erp-input font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Target Department</label>
                <select
                  value={newExamForm.targetDepartment}
                  onChange={(e) => setNewExamForm({ ...newExamForm, targetDepartment: e.target.value })}
                  className="erp-select w-full"
                >
                  <option value="Computer Science and Engineering">Computer Science and Engineering</option>
                  <option value="Electronics & Communication">Electronics & Communication</option>
                  <option value="Information Technology">Information Technology</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Security Instructions</label>
                <textarea
                  rows={3}
                  value={newExamForm.instructions}
                  onChange={(e) => setNewExamForm({ ...newExamForm, instructions: e.target.value })}
                  className="erp-input font-mono"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200">
                <button type="button" onClick={() => setIsCreateExamOpen(false)} className="erp-btn-secondary py-1.5 text-xs">Cancel</button>
                <button type="submit" className="erp-btn-primary py-1.5 text-xs">Schedule & Publish Paper</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Preview Question Paper */}
      {selectedExamPreview && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="erp-card max-w-xl w-full space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{selectedExamPreview.title}</h3>
                <p className="text-xs text-slate-500">Official Question Paper Preview</p>
              </div>
              <button onClick={() => setSelectedExamPreview(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1">
                <div className="font-bold text-slate-800">Target Department: {selectedExamPreview.targetDepartment}</div>
                <div className="font-mono text-slate-600">Total Duration: {selectedExamPreview.durationMinutes} Minutes • Total Marks: {selectedExamPreview.totalMarks}</div>
              </div>
              <div>
                <span className="font-bold text-slate-700 uppercase block mb-1">Instructions:</span>
                <p className="text-slate-600 whitespace-pre-wrap font-mono bg-slate-50 p-2.5 rounded border border-slate-200">{selectedExamPreview.instructions}</p>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={() => setSelectedExamPreview(null)} className="erp-btn-secondary py-1.5 text-xs">Close Preview</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {isAddStudentOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="erp-card max-w-md w-full space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold text-slate-900">Add New Student Account</h3>
              <button onClick={() => setIsAddStudentOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleAddStudent} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Register Number *</label>
                <input
                  type="text"
                  value={newStudent.registerNo}
                  onChange={(e) => setNewStudent({ ...newStudent, registerNo: e.target.value })}
                  required
                  placeholder="71762105042"
                  className="erp-input font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Student Full Name *</label>
                <input
                  type="text"
                  value={newStudent.name}
                  onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                  required
                  placeholder="Ganesh Kumar"
                  className="erp-input"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Institutional Email *</label>
                <input
                  type="email"
                  value={newStudent.email}
                  onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })}
                  required
                  placeholder="ganesh@cit.edu.in"
                  className="erp-input"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setIsAddStudentOpen(false)} className="erp-btn-secondary py-1.5 text-xs">Cancel</button>
                <button type="submit" className="erp-btn-primary py-1.5 text-xs">Save Student</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Faculty Modal */}
      {isAddFacultyOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="erp-card max-w-md w-full space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold text-slate-900">Add New Faculty Member</h3>
              <button onClick={() => setIsAddFacultyOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleAddFaculty} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Faculty Name *</label>
                <input
                  type="text"
                  value={newFaculty.name}
                  onChange={(e) => setNewFaculty({ ...newFaculty, name: e.target.value })}
                  required
                  placeholder="Dr. Sabitha"
                  className="erp-input"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Institutional Email *</label>
                <input
                  type="email"
                  value={newFaculty.email}
                  onChange={(e) => setNewFaculty({ ...newFaculty, email: e.target.value })}
                  required
                  placeholder="sabitha@cit.edu.in"
                  className="erp-input"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setIsAddFacultyOpen(false)} className="erp-btn-secondary py-1.5 text-xs">Cancel</button>
                <button type="submit" className="erp-btn-primary py-1.5 text-xs">Save Faculty</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Invigilator Modal */}
      {isAssignInvigilatorOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="erp-card max-w-md w-full space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold text-slate-900">Assign Invigilator to Examination</h3>
              <button onClick={() => setIsAssignInvigilatorOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleAssignInvigilator} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Select Examination *</label>
                <select
                  value={assignForm.testId}
                  onChange={(e) => setAssignForm({ ...assignForm, testId: e.target.value })}
                  required
                  className="erp-select w-full"
                >
                  <option value="">-- Choose Examination Paper --</option>
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>{ex.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Select Faculty Invigilator *</label>
                <select
                  value={assignForm.facultyId}
                  onChange={(e) => setAssignForm({ ...assignForm, facultyId: e.target.value })}
                  required
                  className="erp-select w-full"
                >
                  <option value="">-- Choose Faculty Member --</option>
                  {faculty.map((f) => (
                    <option key={f.id} value={f.id}>{f.name} ({f.department})</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setIsAssignInvigilatorOpen(false)} className="erp-btn-secondary py-1.5 text-xs">Cancel</button>
                <button type="submit" className="erp-btn-primary py-1.5 text-xs">Assign Invigilator</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Question Modal */}
      {isAddQuestionOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="erp-card max-w-lg w-full space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold text-slate-900">Add New Question to Question Bank</h3>
              <button onClick={() => setIsAddQuestionOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreateQuestion} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Question Statement *</label>
                <textarea
                  value={newQuestionForm.text}
                  onChange={(e) => setNewQuestionForm({ ...newQuestionForm, text: e.target.value })}
                  required
                  rows={3}
                  placeholder="Enter complete question statement..."
                  className="erp-input font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Question Type</label>
                  <select
                    value={newQuestionForm.type}
                    onChange={(e) => setNewQuestionForm({ ...newQuestionForm, type: e.target.value })}
                    className="erp-select w-full"
                  >
                    <option value="MCQ">Multiple Choice (MCQ)</option>
                    <option value="MSQ">Multiple Select (MSQ)</option>
                    <option value="NAT">Numerical Answer (NAT)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Difficulty Level</label>
                  <select
                    value={newQuestionForm.difficulty}
                    onChange={(e) => setNewQuestionForm({ ...newQuestionForm, difficulty: e.target.value })}
                    className="erp-select w-full"
                  >
                    <option value="EASY">Easy</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HARD">Hard</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Marks</label>
                  <input
                    type="number"
                    step="0.5"
                    value={newQuestionForm.marks}
                    onChange={(e) => setNewQuestionForm({ ...newQuestionForm, marks: e.target.value })}
                    className="erp-input font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Negative Marks</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newQuestionForm.negativeMarks}
                    onChange={(e) => setNewQuestionForm({ ...newQuestionForm, negativeMarks: e.target.value })}
                    className="erp-input font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Explanation & Solution Steps</label>
                <textarea
                  value={newQuestionForm.explanation}
                  onChange={(e) => setNewQuestionForm({ ...newQuestionForm, explanation: e.target.value })}
                  rows={2}
                  placeholder="Optional concept explanation..."
                  className="erp-input font-mono"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setIsAddQuestionOpen(false)} className="erp-btn-secondary py-1.5 text-xs">Cancel</button>
                <button type="submit" className="erp-btn-primary py-1.5 text-xs">Save Question</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-3 px-6 text-center text-xs text-slate-500 mt-auto">
        © 2026 University Examination Management System | Controller of Examinations | Version 2.0
      </footer>
    </div>
  );
}
