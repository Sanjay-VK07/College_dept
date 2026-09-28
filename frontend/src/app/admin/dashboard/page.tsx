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
  FileCheck,
  PieChart as PieChartIcon,
  Bot,
  Building,
} from 'lucide-react';
import { ExamPreviewModal } from '@/components/question-bank/ExamPreviewModal';
import api from '@/lib/api';
import { aiService } from '@/services/aiService';
import { exportToCSV, printOrExportPDF } from '@/lib/exportUtils';
import { AIExaminationAssistant } from '@/components/ai/AIExaminationAssistant';
import { SmartQuestionPaperBuilder } from '@/components/question-bank/SmartQuestionPaperBuilder';
import { QuestionBankImportPanel } from '@/components/question-bank/QuestionBankImportPanel';
import { QuestionBankReviewQueuePanel } from '@/components/question-bank/QuestionBankReviewQueuePanel';
import { SearchableSubjectSelect } from '@/components/question-bank/SearchableSubjectSelect';
import { CURRENT_INSTITUTION } from '@/config/institution';
import { QuestionOptionContent, getOptionText } from '@/components/question-bank/QuestionOptionContent';
import { QuestionRenderer } from '@/components/question-bank/QuestionRenderer';

interface College {
  id: string;
  code: string;
  name: string;
  domain?: string;
  isDefault?: boolean;
}

interface MasterDepartment {
  id: string;
  code: string;
  name: string;
  collegeId: string;
  active: boolean;
  studentCount?: number;
}

const DEFAULT_COLLEGES: College[] = [
  { id: 'citchennai', code: 'CIT', name: 'Chennai Institute of Technology', domain: 'citchennai.net', isDefault: true },
  { id: 'uce', code: 'UCE', name: 'University College of Engineering', domain: 'uce.edu' },
  { id: 'cit-auto', code: 'CIT-AUTO', name: 'CIT Autonomous College', domain: 'citauto.edu' },
];

const DEFAULT_DEPARTMENTS: MasterDepartment[] = [
  // Fixed Institution: Chennai Institute of Technology (CIT)
  { id: 'dept-cit-cse', code: 'CSE', name: 'Computer Science and Engineering', collegeId: 'citchennai', active: true },
  { id: 'dept-cit-ece', code: 'ECE', name: 'Electronics & Communication', collegeId: 'citchennai', active: true },
  { id: 'dept-cit-it', code: 'IT', name: 'Information Technology', collegeId: 'citchennai', active: true },
  { id: 'dept-cit-aids', code: 'AI&DS', name: 'Artificial Intelligence and Data Science', collegeId: 'citchennai', active: true },
  { id: 'dept-cit-bme', code: 'BME', name: 'Biomedical Engineering', collegeId: 'citchennai', active: true },
  { id: 'dept-cit-mech', code: 'MECH', name: 'Mechanical Engineering', collegeId: 'citchennai', active: true },
  { id: 'dept-cit-eee', code: 'EEE', name: 'Electrical and Electronics Engineering', collegeId: 'citchennai', active: true },
  { id: 'dept-cit-civil', code: 'CIVIL', name: 'Civil Engineering', collegeId: 'citchennai', active: true },
  { id: 'dept-cit-biotech', code: 'BIOTECH', name: 'Biotechnology', collegeId: 'citchennai', active: true },
  // Preserved records for other colleges (non-destructive)
  { id: 'dept-uce-civil', code: 'CIVIL', name: 'Civil Engineering', collegeId: 'uce', active: true },
  { id: 'dept-uce-mech', code: 'MECH', name: 'Mechanical Engineering', collegeId: 'uce', active: true },
  { id: 'dept-uce-eee', code: 'EEE', name: 'Electrical and Electronics Engineering', collegeId: 'uce', active: true },
  { id: 'dept-uce-biotech', code: 'BIOTECH', name: 'Biotechnology', collegeId: 'uce', active: true },
];

const DEPARTMENT_CODE_MAP: Record<string, string> = {
  'Computer Science and Engineering': 'CSE',
  'Computer Science & Engineering': 'CSE',
  'CSE': 'CSE',
  'Electronics & Communication': 'ECE',
  'Electronics and Communication': 'ECE',
  'ECE': 'ECE',
  'Information Technology': 'IT',
  'IT': 'IT',
  'Mechanical Engineering': 'MECH',
  'MECH': 'MECH',
  'Civil Engineering': 'CIVIL',
  'CIVIL': 'CIVIL',
  'Electrical and Electronics Engineering': 'EEE',
  'Electrical & Electronics Engineering': 'EEE',
  'EEE': 'EEE',
  'Biotechnology': 'BIOTECH',
  'Artificial Intelligence and Data Science': 'AI&DS',
  'Artificial Intelligence & Data Science': 'AI&DS',
  'Biomedical Engineering': 'BME',
  'BME': 'BME',
};

const DEPARTMENT_FULL_NAME_MAP: Record<string, string> = {
  'CSE': 'Computer Science and Engineering',
  'ECE': 'Electronics & Communication',
  'IT': 'Information Technology',
  'MECH': 'Mechanical Engineering',
  'CIVIL': 'Civil Engineering',
  'EEE': 'Electrical and Electronics Engineering',
  'BIOTECH': 'Biotechnology',
  'AI&DS': 'Artificial Intelligence and Data Science',
  'BME': 'Biomedical Engineering',
};

function getDepartmentCode(dept: string, masterList?: MasterDepartment[]): string {
  if (!dept) return 'GEN';
  const trimmed = dept.trim();
  if (masterList && masterList.length > 0) {
    const found = masterList.find(
      (d) => d.name.toLowerCase() === trimmed.toLowerCase() || d.code.toLowerCase() === trimmed.toLowerCase()
    );
    if (found) return found.code;
  }
  if (DEPARTMENT_CODE_MAP[trimmed]) return DEPARTMENT_CODE_MAP[trimmed];
  if (trimmed.length <= 5) return trimmed.toUpperCase();
  const words = trimmed.replace(/&/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return words.map((w) => w[0].toUpperCase()).join('');
  }
  return trimmed.slice(0, 4).toUpperCase();
}

function getDepartmentFullName(dept: string, masterList?: MasterDepartment[]): string {
  if (!dept) return 'General Department';
  const trimmed = dept.trim();
  if (masterList && masterList.length > 0) {
    const found = masterList.find(
      (d) => d.code.toLowerCase() === trimmed.toLowerCase() || d.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (found) return found.name;
  }
  return DEPARTMENT_FULL_NAME_MAP[trimmed] || trimmed;
}

interface AcademicSemester {
  id: string;
  value: string;
  number: number;
  year: number;
  label: string;
  shortLabel: string;
  roman: string;
}

const ACADEMIC_SEMESTERS: AcademicSemester[] = [
  { id: 'SEM-1', value: 'Semester I', number: 1, year: 1, label: 'Semester I', shortLabel: 'Sem I', roman: 'I' },
  { id: 'SEM-2', value: 'Semester II', number: 2, year: 1, label: 'Semester II', shortLabel: 'Sem II', roman: 'II' },
  { id: 'SEM-3', value: 'Semester III', number: 3, year: 2, label: 'Semester III', shortLabel: 'Sem III', roman: 'III' },
  { id: 'SEM-4', value: 'Semester IV', number: 4, year: 2, label: 'Semester IV', shortLabel: 'Sem IV', roman: 'IV' },
  { id: 'SEM-5', value: 'Semester V', number: 5, year: 3, label: 'Semester V', shortLabel: 'Sem V', roman: 'V' },
  { id: 'SEM-6', value: 'Semester VI', number: 6, year: 3, label: 'Semester VI', shortLabel: 'Sem VI', roman: 'VI' },
  { id: 'SEM-7', value: 'Semester VII', number: 7, year: 4, label: 'Semester VII', shortLabel: 'Sem VII', roman: 'VII' },
  { id: 'SEM-8', value: 'Semester VIII', number: 8, year: 4, label: 'Semester VIII', shortLabel: 'Sem VIII', roman: 'VIII' },
];

function getExamSemester(exam: any): string {
  if (!exam) return 'Semester VI';

  // 1. Direct explicit property
  if (exam.targetSemester && typeof exam.targetSemester === 'string') {
    const matched = ACADEMIC_SEMESTERS.find(
      (s) =>
        s.value.toLowerCase() === exam.targetSemester.toLowerCase() ||
        s.label.toLowerCase() === exam.targetSemester.toLowerCase() ||
        s.shortLabel.toLowerCase() === exam.targetSemester.toLowerCase()
    );
    if (matched) return matched.value;
  }

  // 2. Numeric semester
  if (typeof exam.semester === 'number' && exam.semester >= 1 && exam.semester <= 8) {
    const matched = ACADEMIC_SEMESTERS.find((s) => s.number === exam.semester);
    if (matched) return matched.value;
  }
  if (typeof exam.semester === 'string') {
    const matched = ACADEMIC_SEMESTERS.find(
      (s) =>
        s.value.toLowerCase() === exam.semester.toLowerCase() ||
        s.label.toLowerCase() === exam.semester.toLowerCase() ||
        s.shortLabel.toLowerCase() === exam.semester.toLowerCase() ||
        s.number.toString() === exam.semester
    );
    if (matched) return matched.value;
  }

  // 3. Scan title and description text
  const textToScan = `${exam.title || ''} ${exam.description || ''}`;

  const romanOrdered = [
    { roman: 'VIII', num: 8, sem: 'Semester VIII' },
    { roman: 'VII', num: 7, sem: 'Semester VII' },
    { roman: 'VI', num: 6, sem: 'Semester VI' },
    { roman: 'IV', num: 4, sem: 'Semester IV' },
    { roman: 'V', num: 5, sem: 'Semester V' },
    { roman: 'III', num: 3, sem: 'Semester III' },
    { roman: 'II', num: 2, sem: 'Semester II' },
    { roman: 'I', num: 1, sem: 'Semester I' },
  ];

  for (const item of romanOrdered) {
    const regex = new RegExp(`\\b(semester|sem)[\\s\\-_:]*(${item.roman}|${item.num})\\b`, 'i');
    if (regex.test(textToScan)) {
      return item.sem;
    }
  }

  for (const item of romanOrdered) {
    if (textToScan.includes(`Semester ${item.roman}`) || textToScan.includes(`Sem ${item.roman}`)) {
      return item.sem;
    }
  }

  // 4. Anna University / Standard course codes and DBMS demo exam check
  if (textToScan.includes('CS8601') || textToScan.includes('Database Management Systems')) {
    return 'Semester VI';
  }
  if (textToScan.includes('CS6301') || textToScan.includes('Compiler Design')) {
    return 'Semester VI';
  }

  // 5. Fallback based on targetYear
  if (exam.targetYear) {
    const yr = Number(exam.targetYear);
    if (yr === 1) return 'Semester I';
    if (yr === 2) return 'Semester III';
    if (yr === 3) return 'Semester VI';
    if (yr === 4) return 'Semester VII';
  }

  return 'Semester VI';
}

export default function AdminDashboard() {
  const router = useRouter();
  const [zoomedImage, setZoomedImage] = useState<{ url: string; title?: string } | null>(null);
  // Question Bank sub-navigation: Library (browse/filter/select), Import (JSONL/Excel/CSV/PDF —
  // one entry point), Builder (the relocated Smart Question Paper Builder).
  const [questionBankView, setQuestionBankView] = useState<'LIBRARY' | 'REVIEW_QUEUE' | 'IMPORT' | 'BUILDER'>('LIBRARY');
  const [builderInitialQuestions, setBuilderInitialQuestions] = useState<any[] | undefined>(undefined);

  const [activeTab, setActiveTab] = useState<
    | 'OVERVIEW'
    | 'EXAMS'
    | 'QUESTIONS'
    | 'STUDENTS'
    | 'FACULTY'
    | 'DEPARTMENTS'
    | 'REPORTS'
    | 'SETTINGS'
    | 'AI_ASSISTANT'
  >('OVERVIEW');

  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [searchGlobal, setSearchGlobal] = useState('');

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
    department: '',
    year: '3',
    semester: '6',
    section: 'A',
  });

  // Department Master Data State (Fixed Institution: Chennai Institute of Technology)
  const [colleges, setColleges] = useState<College[]>(DEFAULT_COLLEGES);
  const [departmentsList, setDepartmentsList] = useState<MasterDepartment[]>(DEFAULT_DEPARTMENTS);
  const [isAddDeptOpen, setIsAddDeptOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<MasterDepartment | null>(null);
  const [deptFormData, setDeptFormData] = useState({
    code: '',
    name: '',
    collegeId: CURRENT_INSTITUTION.id,
    active: true,
  });
  const [deletingDept, setDeletingDept] = useState<MasterDepartment | null>(null);

  // Table State: Faculty Directory
  const [faculty, setFaculty] = useState<any[]>([]);
  const [isAddFacultyOpen, setIsAddFacultyOpen] = useState(false);
  const [newFaculty, setNewFaculty] = useState({ name: '', email: '', department: 'Computer Science and Engineering' });

  // Question Bank & Exams
  const [questions, setQuestions] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [questionBankDocuments, setQuestionBankDocuments] = useState<any[]>([]);
  const [pdfTargetCount, setPdfTargetCount] = useState<string>('');
  const [pdfImportJob, setPdfImportJob] = useState<{
    fileName: string;
    documentId: string;
    generationRequestId: string;
    status: string;
    message?: string;
    generatedCount?: number;
    requestedCount?: number;
    autoPublishedCount?: number;
    pendingReviewCount?: number;
    duplicateCount?: number;
    structureStatus?: string;
    totalPages?: number | null;
    pagesProcessed?: number;
  } | null>(null);

  // AI Solution & Exam Assembly States
  const [pendingSolutions, setPendingSolutions] = useState<any[]>([]);
  const [isGeneratingSolutionId, setIsGeneratingSolutionId] = useState<string | null>(null);
  const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(null);
  const [isAssemblingExam, setIsAssemblingExam] = useState<boolean>(false);
  const [examAssembleTitle, setExamAssembleTitle] = useState<string>('');
  const [examAssembleCount, setExamAssembleCount] = useState<number>(10);

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
    targetSemester: 'Semester VI',
    maxViolations: '5',
    instructions: '1. Total Duration: 180 Minutes.\n2. Fullscreen security mode is strictly enforced.',
    questionCount: '',
    sourceDocumentId: '',
  });

  // Results Ledger & System Settings State
  const [resultsLedger, setResultsLedger] = useState<any[]>([]);
  const [systemSettings, setSystemSettings] = useState<any[]>([]);
  const [isAddQuestionOpen, setIsAddQuestionOpen] = useState(false);
  const [newQuestionForm, setNewQuestionForm] = useState({
    text: '',
    type: 'MCQ',
    difficulty: 'MEDIUM',
    marks: '1',
    negativeMarks: '0.33',
    explanation: '',
  });

  // Question Bank bulk selection & deletion
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Question Bank Library filters — client-side over the already-fetched `questions` array
  // (~450 rows at current scale; not worth a new server-side query surface for this).
  const [qbSearch, setQbSearch] = useState('');
  const [qbSubjectFilter, setQbSubjectFilter] = useState('ALL');
  const [qbTopicFilter, setQbTopicFilter] = useState('ALL');
  const [qbTypeFilter, setQbTypeFilter] = useState('ALL');
  const [qbDifficultyFilter, setQbDifficultyFilter] = useState('ALL');
  const [qbVerificationFilter, setQbVerificationFilter] = useState('ALL');
  const [qbOriginFilter, setQbOriginFilter] = useState('ALL');
  const [qbDetailQuestion, setQbDetailQuestion] = useState<any | null>(null);

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

  useEffect(() => {
    if (activeTab === 'QUESTIONS') {
      loadPendingSolutions();
    }
  }, [activeTab]);

  const loadQuestionBankDocuments = async () => {
    try {
      const res = await api.get('/admin/question-bank-documents');
      if (res.data?.success) setQuestionBankDocuments(res.data.data || []);
    } catch (err) {
      console.error('Failed to load question bank PDF sets:', err);
    }
  };

  const handleViewPdf = async (documentId: string, fileName: string) => {
    try {
      const res = await api.get(`/ai/documents/${documentId}/download`, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(blobUrl, '_blank');
    } catch (err: any) {
      showToast(err.response?.data?.message || `Failed to open ${fileName}`);
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
      if (silent) {
        api.get('/admin/departments').then((res) => {
          if (res?.data?.success && res.data.data?.length > 0) {
            setDepartmentsList(res.data.data);
          }
        }).catch(() => {});
        return;
      }

      // Group 2: Management directories
      const [studentsRes, facultyRes, questionsRes, examsRes, questionBankDocsRes] = await Promise.allSettled([
        api.get('/admin/students'),
        api.get('/admin/faculty'),
        api.get('/admin/questions'),
        api.get('/admin/exams'),
        api.get('/admin/question-bank-documents'),
      ]);

      if (studentsRes.status === 'fulfilled' && studentsRes.value.data?.success) setStudents(studentsRes.value.data.data);
      if (facultyRes.status === 'fulfilled' && facultyRes.value.data?.success) setFaculty(facultyRes.value.data.data);
      if (questionsRes.status === 'fulfilled' && questionsRes.value.data?.success) setQuestions(questionsRes.value.data.data);
      if (examsRes.status === 'fulfilled' && examsRes.value.data?.success) setExams(examsRes.value.data.data);
      if (questionBankDocsRes.status === 'fulfilled' && questionBankDocsRes.value.data?.success) setQuestionBankDocuments(questionBankDocsRes.value.data.data);

      // Group 3: System settings, ledger, colleges & departments
      const [resultsRes, settingsRes, collegesRes, deptsRes] = await Promise.allSettled([
        api.get('/admin/results-ledger'),
        api.get('/admin/settings'),
        api.get('/admin/colleges'),
        api.get('/admin/departments'),
      ]);

      if (resultsRes.status === 'fulfilled' && resultsRes.value.data?.success) setResultsLedger(resultsRes.value.data.data);
      if (settingsRes.status === 'fulfilled' && settingsRes.value.data?.success) setSystemSettings(settingsRes.value.data.data);
      if (collegesRes.status === 'fulfilled' && collegesRes.value.data?.success && collegesRes.value.data.data?.length > 0) {
        setColleges(collegesRes.value.data.data);
      }
      if (deptsRes.status === 'fulfilled' && deptsRes.value.data?.success && deptsRes.value.data.data?.length > 0) {
        setDepartmentsList(deptsRes.value.data.data);
      }
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
    if (!newStudent.department) {
      showToast('Please select a department');
      return;
    }
    try {
      const res = await api.post('/admin/students', newStudent);
      if (res.data?.success) {
        showToast('Student record added successfully');
        setIsAddStudentOpen(false);
        setNewStudent({ registerNo: '', name: '', email: '', department: '', year: '3', semester: '6', section: 'A' });
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

  const handleToggleExamPermission = async (id: string, next: boolean) => {
    // Optimistic update, reverted on failure — this toggle is hit often and shouldn't feel laggy.
    setFaculty((prev) => prev.map((f) => (f.id === id ? { ...f, canCreateExams: next } : f)));
    try {
      await api.put(`/admin/faculty/${id}`, { canCreateExams: next });
      showToast(next ? 'Exam-creation permission granted.' : 'Exam-creation permission revoked.');
    } catch (err: any) {
      setFaculty((prev) => prev.map((f) => (f.id === id ? { ...f, canCreateExams: !next } : f)));
      showToast(err.response?.data?.message || 'Failed to update permission.');
    }
  };

  // Handlers: Department Master Data
  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptFormData.code.trim() || !deptFormData.name.trim()) {
      showToast('Department code and name are required');
      return;
    }
    try {
      const res = await api.post('/admin/departments', deptFormData);
      if (res.data?.success) {
        showToast(`Department ${res.data.data.code} added successfully`);
        setIsAddDeptOpen(false);
        setDeptFormData({
          code: '',
          name: '',
          collegeId: CURRENT_INSTITUTION.id,
          active: true,
        });
        fetchInitialData(true);
      }
    } catch (err: any) {
      console.error('Error creating department:', err);
      showToast(err.response?.data?.message || 'Failed to create department');
    }
  };

  const handleUpdateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDept) return;
    if (!deptFormData.code.trim() || !deptFormData.name.trim()) {
      showToast('Department code and name are required');
      return;
    }
    try {
      const res = await api.put(`/admin/departments/${editingDept.id}`, deptFormData);
      if (res.data?.success) {
        showToast(`Department ${res.data.data.code} updated successfully`);
        setEditingDept(null);
        fetchInitialData(true);
      }
    } catch (err: any) {
      console.error('Error updating department:', err);
      showToast(err.response?.data?.message || 'Failed to update department');
    }
  };

  const handleToggleDepartmentStatus = async (dept: MasterDepartment) => {
    try {
      const res = await api.put(`/admin/departments/${dept.id}`, {
        active: !dept.active,
      });
      if (res.data?.success) {
        showToast(`Department ${dept.code} ${dept.active ? 'deactivated' : 'activated'}`);
        fetchInitialData(true);
      }
    } catch (err: any) {
      console.error('Error toggling department status:', err);
      showToast(err.response?.data?.message || 'Failed to update department status');
    }
  };

  const handleDeleteDepartment = async () => {
    if (!deletingDept) return;
    try {
      const res = await api.delete(`/admin/departments/${deletingDept.id}`);
      if (res.data?.success) {
        showToast(`Department ${deletingDept.code} deleted`);
        setDeletingDept(null);
        fetchInitialData(true);
      }
    } catch (err: any) {
      console.error('Error deleting department:', err);
      showToast(err.response?.data?.message || 'Failed to delete department');
    }
  };

  // Handlers: Examination Management
  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const semObj = ACADEMIC_SEMESTERS.find((s) => s.value === newExamForm.targetSemester) || ACADEMIC_SEMESTERS[5];
      const payload = {
        ...newExamForm,
        targetYear: semObj.year,
        description: newExamForm.description || `Official CBT Assessment for ${newExamForm.targetSemester}`,
      };
      const res = await api.post('/admin/exams', payload);
      if (res.data?.success) {
        showToast(res.data.message || 'Examination scheduled and published successfully!');
        setIsCreateExamOpen(false);
        setNewExamForm({
          title: '',
          description: '',
          examType: 'SCHEDULED',
          durationMinutes: '180',
          totalMarks: '100',
          targetDepartment: 'Computer Science and Engineering',
          targetSemester: 'Semester VI',
          maxViolations: '5',
          instructions: '1. Total Duration: 180 Minutes.\n2. Fullscreen security mode is strictly enforced.',
          questionCount: '',
          sourceDocumentId: '',
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
      const examSem = getExamSemester(exam);
      const duplicateData = {
        title: `${exam.title} (Copy)`,
        description: exam.description,
        examType: exam.examType || 'SCHEDULED',
        durationMinutes: exam.durationMinutes,
        totalMarks: exam.totalMarks,
        targetDepartment: exam.targetDepartment || 'Computer Science and Engineering',
        targetSemester: examSem,
        targetYear: exam.targetYear,
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
    if (!id || deletingQuestionId === id) return;
    if (!confirm('Are you sure you want to delete this question?')) return;

    console.log('[QUESTION DELETE UI] requestedId=', id);
    setDeletingQuestionId(id);
    try {
      const res = await api.delete(`/admin/questions/${id}`);
      if (res.data?.success || res.status === 200) {
        showToast(res.data?.message || 'Question removed from Question Bank');
        setQuestions((prev) => prev.filter((q) => q.id !== id));
      }
    } catch (err: any) {
      const status = err.response?.status;
      const errCode = err.response?.data?.code;
      const errMsg = err.response?.data?.message;

      console.warn('[QUESTION DELETE UI Error]:', status, errCode, errMsg);

      if (status === 409 || errCode === 'QUESTION_IN_USE') {
        showToast(errMsg || 'This question is currently used in an exam and cannot be deleted.');
      } else if (status === 404 || errCode === 'QUESTION_NOT_FOUND') {
        showToast('Question no longer exists.');
        setQuestions((prev) => prev.filter((q) => q.id !== id));
      } else if (status === 403 || errCode === 'UNAUTHORIZED') {
        showToast(errMsg || 'You are not authorized to delete this question.');
      } else {
        showToast(errMsg || 'Unable to delete the question right now.');
      }
    } finally {
      setDeletingQuestionId(null);
    }
  };

  // --- Question Bank bulk selection ---
  // The individual-questions table has no pagination (all matching rows render at once), so
  // "select all" and "current page" are the same set: individualQuestions itself.

  const handleToggleSelectQuestion = (id: string) => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAllVisible = () => {
    const visibleIds = individualQuestions.map((q: any) => q.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id: string) => selectedQuestionIds.has(id));

    if (allVisibleSelected) {
      // Deselect all currently visible rows only.
      setSelectedQuestionIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id: string) => next.delete(id));
        return next;
      });
    } else {
      // Select every currently visible row (adds to, doesn't replace, any existing selection).
      setSelectedQuestionIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id: string) => next.add(id));
        return next;
      });
    }
  };

  const handleClearSelection = () => setSelectedQuestionIds(new Set());

  // Drop any selected IDs that are no longer part of the visible/filtered dataset (e.g. after a
  // refetch or a question being deleted individually) — never let a stale ID silently ride along
  // into a later bulk action.
  useEffect(() => {
    setSelectedQuestionIds((prev) => {
      if (prev.size === 0) return prev;
      const visibleIds = new Set(individualQuestions.map((q: any) => q.id));
      const next = new Set(Array.from(prev).filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions]);

  const handleBulkDeleteQuestions = async () => {
    const idsToDelete = Array.from(selectedQuestionIds);
    if (idsToDelete.length === 0) return;

    setIsBulkDeleting(true);
    try {
      const res = await api.delete('/admin/questions/bulk', { data: { questionIds: idsToDelete } });

      if (res.data?.success) {
        // Remove the deleted questions from current table state immediately...
        const deletedIds = new Set(idsToDelete.filter((id) => !(res.data.blockedIds || []).includes(id) && !(res.data.forbiddenIds || []).includes(id)));
        setQuestions((prev) => prev.filter((q: any) => !deletedIds.has(q.id)));
        setSelectedQuestionIds(new Set());
        setIsBulkDeleteConfirmOpen(false);
        showToast(res.data.message || `${res.data.deletedCount} question(s) deleted successfully.`);
        // ...then revalidate against the backend so counts/stats/pagination stay fully in sync.
        fetchInitialData();
      } else {
        showToast(res.data?.message || 'Bulk delete failed.');
      }
    } catch (err: any) {
      // Never pretend it succeeded — keep the selection intact so the user can retry or inspect.
      showToast(err.response?.data?.message || 'Bulk delete failed. No questions were deleted.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Future bulk actions (change difficulty/topic/type, export selected, approve/reject selected,
  // etc.) should follow the same shape as handleBulkDeleteQuestions: read selectedQuestionIds,
  // call a real backend endpoint, then reconcile local state from the response — and get their
  // own button in the bulk action toolbar below, next to "Delete Selected".

  const handleQuestionFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // allow re-selecting the same file later

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    const formData = new FormData();
    formData.append('file', file);
    if (isPdf && pdfTargetCount.trim()) {
      formData.append('targetQuestionCount', pdfTargetCount.trim());
    }

    try {
      const res = await api.post('/admin/upload-questions', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (!res.data?.success) {
        showToast(res.data?.message || 'Upload failed');
        return;
      }

      // PDF uploads are now processed in the background (large PDFs are split into page
      // batches internally rather than sent in one request) — poll for real progress instead
      // of a single blocking response.
      if (res.data.generationRequestId) {
        setPdfImportJob({
          fileName: file.name,
          documentId: res.data.documentId,
          generationRequestId: res.data.generationRequestId,
          status: res.data.status || 'QUEUED',
        });
        showToast(res.data.message || 'PDF uploaded — extracting questions in the background.');
        pollPdfImportJob(res.data.generationRequestId, res.data.documentId);
      } else {
        showToast(res.data.message || 'Questions uploaded successfully');
        fetchInitialData();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to upload questions file');
    }
  };

  const PDF_IMPORT_TERMINAL_STATUSES = ['COMPLETED', 'GENERATED_PARTIAL_BATCH', 'FAILED'];

  const pollPdfImportJob = (generationRequestId: string, documentId: string) => {
    const interval = setInterval(async () => {
      try {
        const [statusRes, structureRes] = await Promise.all([
          aiService.getBatchJobStatus(generationRequestId),
          // Page-level extraction progress lives on the underlying document-structure job
          // (pdfQuestionImportService triggers it internally) rather than the batch job itself.
          api.get(`/admin/documents/${documentId}/processing-status`).catch(() => null),
        ]);

        if (!statusRes.success) return;
        const job = statusRes.job;
        const structureJob = structureRes?.data?.data;

        setPdfImportJob((prev) =>
          prev && prev.generationRequestId === generationRequestId
            ? {
                ...prev,
                status: job.status,
                message: job.statusMessage,
                generatedCount: job.generatedCount,
                requestedCount: job.requestedCount,
                autoPublishedCount: job.autoPublishedCount,
                pendingReviewCount: job.pendingReviewCount,
                duplicateCount: job.duplicateCount,
                structureStatus: structureJob?.status,
                totalPages: structureJob?.totalPages ?? prev.totalPages,
                pagesProcessed: structureJob?.pagesProcessed ?? prev.pagesProcessed,
              }
            : prev
        );

        if (PDF_IMPORT_TERMINAL_STATUSES.includes(job.status)) {
          clearInterval(interval);
          showToast(job.statusMessage || `PDF import ${job.status.toLowerCase()}`);
          fetchInitialData();
        }
      } catch (err) {
        console.error('Failed to poll PDF import job status:', err);
      }
    }, 3000);
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
      const matchesDept =
        deptFilter === 'ALL' ||
        s.department === deptFilter ||
        getDepartmentCode(s.department, departmentsList) === deptFilter ||
        getDepartmentFullName(s.department, departmentsList) === deptFilter;
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
        examDeptFilter === 'ALL' ||
        e.targetDepartment === examDeptFilter ||
        getDepartmentCode(e.targetDepartment, departmentsList) === examDeptFilter ||
        getDepartmentFullName(e.targetDepartment, departmentsList) === examDeptFilter;

      const examSemester = getExamSemester(e);
      const matchesSem =
        examSemFilter === 'ALL' ||
        examSemester === examSemFilter ||
        (examSemFilter !== 'ALL' && (
          e.title?.toLowerCase().includes(examSemFilter.toLowerCase()) ||
          e.description?.toLowerCase().includes(examSemFilter.toLowerCase())
        ));

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

      return matchesSearch && matchesDept && matchesSem && matchesFaculty && matchesStatus;
    })
    .sort((a, b) => {
      if (examSortBy === 'NEWEST') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (examSortBy === 'OLDEST') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (examSortBy === 'TITLE_ASC') return a.title.localeCompare(b.title);
      if (examSortBy === 'MARKS_DESC') return b.totalMarks - a.totalMarks;
      return 0;
    });

  // Question Bank Library — every question (SOURCE-imported, individually authored, and
  // AI-generated alike), filterable by subject/topic/type/difficulty/verification/origin.
  const qbSubjectOptions = Array.from(
    new Map(
      questions
        .map((q: any) => q.subtopic?.topic?.module?.subject)
        .filter(Boolean)
        .map((s: any) => [s.id, s])
    ).values()
  ).sort((a: any, b: any) => a.name.localeCompare(b.name));

  const qbTopicOptions = Array.from(
    new Map(
      questions
        .filter((q: any) => qbSubjectFilter === 'ALL' || q.subtopic?.topic?.module?.subject?.id === qbSubjectFilter)
        .map((q: any) => q.subtopic?.topic)
        .filter(Boolean)
        .map((t: any) => [t.id, t])
    ).values()
  ).sort((a: any, b: any) => a.name.localeCompare(b.name));

  const individualQuestions = questions.filter((q: any) => {
    if (qbSearch) {
      const searchLower = qbSearch.toLowerCase().trim();
      const matchText = q.text?.toLowerCase().includes(searchLower);
      const matchCustomId = (q.customId || q.id || '').toLowerCase().includes(searchLower);
      const matchExplanation = q.explanation?.toLowerCase().includes(searchLower);
      const matchHeading = q.sourceHeading?.toLowerCase().includes(searchLower);
      const matchSubject = q.subtopic?.topic?.module?.subject?.name?.toLowerCase().includes(searchLower);
      const matchTopic = q.subtopic?.topic?.name?.toLowerCase().includes(searchLower);
      if (!matchText && !matchCustomId && !matchExplanation && !matchHeading && !matchSubject && !matchTopic) {
        return false;
      }
    }
    if (qbSubjectFilter !== 'ALL' && q.subtopic?.topic?.module?.subject?.id !== qbSubjectFilter) return false;
    if (qbTopicFilter !== 'ALL' && q.subtopic?.topic?.id !== qbTopicFilter) return false;
    if (qbTypeFilter !== 'ALL' && q.type !== qbTypeFilter) return false;
    if (qbDifficultyFilter !== 'ALL' && q.difficulty !== qbDifficultyFilter) return false;
    if (qbVerificationFilter !== 'ALL' && q.verificationStatus !== qbVerificationFilter) return false;
    if (qbOriginFilter === 'AI_GENERATED' && !(q.aiSources && q.aiSources.length > 0) && q.origin !== 'AI_GENERATED') return false;
    if (qbOriginFilter === 'SOURCE' && ((q.aiSources && q.aiSources.length > 0) || q.origin === 'AI_GENERATED')) return false;
    return true;
  });

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
    departments: departmentsList.length || overview?.departmentBreakdown?.length || 1,
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

  // Departments scoped strictly to the current institution (Chennai Institute of Technology)
  const citDepartments = departmentsList.filter(
    (dept) => !dept.collegeId || dept.collegeId === CURRENT_INSTITUTION.id
  );

  const allActiveDepartments = citDepartments.filter((dept) => dept.active);

  const departmentOptions: string[] = Array.from(
    new Set([
      ...allActiveDepartments.map((d) => d.name),
      ...(overview?.departmentBreakdown?.map((d: any) => d.department || d.name) || []),
      ...(students?.map((s: any) => getDepartmentFullName(s.department, citDepartments)) || []),
    ].filter(Boolean))
  );

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
              <p className="text-xs text-blue-200">Controller of Examinations • {CURRENT_INSTITUTION.name} ({CURRENT_INSTITUTION.code})</p>
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
            { id: 'REPORTS', label: 'Reports', icon: FileText },
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
                  <button onClick={() => setActiveTab('STUDENTS')} className="erp-btn-secondary py-2 text-xs">
                    <Award className="w-3.5 h-3.5 text-amber-700" />
                    <span>View Student Results</span>
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
                      {citDepartments.map((dept) => (
                        <option key={dept.id} value={dept.name}>
                          {dept.code} - {dept.name}
                        </option>
                      ))}
                    </select>

                    {/* Semester Dropdown */}
                    <select
                      value={examSemFilter}
                      onChange={(e) => setExamSemFilter(e.target.value)}
                      className="erp-select py-1.5 text-xs font-medium"
                    >
                      <option value="ALL">All Semesters</option>
                      {ACADEMIC_SEMESTERS.map((sem) => (
                        <option key={sem.id} value={sem.value}>
                          {sem.label}
                        </option>
                      ))}
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
                      <button onClick={() => handleExportCSV('Attendance', filteredExams)} className="erp-btn-secondary py-1.5 text-xs">
                        <FileCheck className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Export Attendance</span>
                      </button>
                      <button onClick={() => handleExportCSV('ExamResults', filteredExams)} className="erp-btn-secondary py-1.5 text-xs">
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Results</span>
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
                      <h3 className="text-sm font-bold text-slate-900">
                        {examSemFilter !== 'ALL'
                          ? `No examinations scheduled for ${examSemFilter}`
                          : 'No examinations have been created.'}
                      </h3>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto">
                        {examSemFilter !== 'ALL'
                          ? `There are currently no active or draft examination papers assigned to ${examSemFilter}.`
                          : 'No examination papers currently match your filter rules. Click below to schedule a new examination.'}
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
                            <th>Semester</th>
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
                                  <td>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 whitespace-nowrap">
                                      {getExamSemester(exam)}
                                    </span>
                                  </td>
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
                                    <td colSpan={11} className="p-4 space-y-3 border-t border-b border-blue-200 text-xs">
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
                              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                <span className="erp-badge-blue">{exam.examType || 'SCHEDULED'}</span>
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  {getExamSemester(exam)}
                                </span>
                              </div>
                              <h4 className="text-sm font-bold text-slate-900">{exam.title}</h4>
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
              {/* Question Bank sub-navigation — Library / Import / Build Examination, the
                  canonical home for the whole question-authoring workflow. */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-1 border-b border-slate-200">
                  {([
                    { id: 'LIBRARY', label: 'Questions' },
                    { id: 'REVIEW_QUEUE', label: `Review Queue (${questions.filter((q: any) => q.verificationStatus === 'NEEDS_REVIEW').length})` },
                    { id: 'IMPORT', label: 'Import / Extract' },
                    { id: 'BUILDER', label: 'Build Examination' },
                  ] as const).map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        if (v.id !== 'BUILDER') setBuilderInitialQuestions(undefined);
                        setQuestionBankView(v.id);
                      }}
                      className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors ${
                        questionBankView === v.id
                          ? 'border-[#1E40AF] text-[#1E40AF]'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
                {questionBankView === 'LIBRARY' && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => setQuestionBankView('IMPORT')} className="erp-btn-secondary py-1.5 text-xs">
                      Import Questions
                    </button>
                    <button
                      onClick={() => { setBuilderInitialQuestions(undefined); setQuestionBankView('BUILDER'); }}
                      className="erp-btn-primary py-1.5 text-xs"
                    >
                      Create Examination
                    </button>
                  </div>
                )}
              </div>

              {questionBankView === 'BUILDER' && (
                <SmartQuestionPaperBuilder
                  role="ADMIN"
                  initialSelectedQuestions={builderInitialQuestions}
                  onExitToQuestionBank={() => { setBuilderInitialQuestions(undefined); setQuestionBankView('LIBRARY'); }}
                />
              )}

              {questionBankView === 'REVIEW_QUEUE' && (
                <QuestionBankReviewQueuePanel
                  questions={questions}
                  onRefreshData={fetchInitialData}
                  onSelectQuestion={(q) => setQbDetailQuestion(q)}
                  showToast={showToast}
                  onZoomImage={(url, title) => setZoomedImage({ url, title })}
                />
              )}

              {questionBankView === 'LIBRARY' && (
              <>

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
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Question Bank</h3>
                <div className="flex flex-wrap items-center gap-2">
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

              {/* PDF Import Progress — real background job status, polled every 3s. Import itself
                  now happens from the Import / Extract sub-tab; this stays visible from Library
                  too so an in-flight extraction is never lost from view mid-navigation. */}
              {pdfImportJob && (
                <div className={`erp-card space-y-2 border-l-4 ${
                  pdfImportJob.status === 'COMPLETED'
                    ? 'border-l-emerald-500'
                    : pdfImportJob.status === 'FAILED'
                    ? 'border-l-red-500'
                    : pdfImportJob.status === 'GENERATED_PARTIAL_BATCH'
                    ? 'border-l-amber-500'
                    : 'border-l-blue-500'
                }`}>
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
                        <button onClick={() => setPdfImportJob(null)} className="text-slate-400 hover:text-slate-700 text-xs">
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

              {/* Uploaded PDF Question Sets — each stored PDF is one entry; questions inside are used
                  for random selection during exam creation but aren't listed individually here. */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Uploaded PDF Question Sets ({questionBankDocuments.length})
                </h4>
                <div className="erp-table-container">
                  <table className="erp-table">
                    <thead>
                      <tr>
                        <th>File Name</th>
                        <th>Questions Extracted</th>
                        <th>Uploaded</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {questionBankDocuments.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-slate-500">
                            No PDF question sets uploaded yet.
                          </td>
                        </tr>
                      ) : (
                        questionBankDocuments.map((doc) => (
                          <tr key={doc.id}>
                            <td className="font-semibold text-slate-900">{doc.fileName || doc.title}</td>
                            <td className="font-bold font-mono text-emerald-700">{doc.questionCount}</td>
                            <td className="font-mono text-xs text-slate-500">{new Date(doc.uploadedAt).toLocaleDateString()}</td>
                            <td>
                              <button
                                onClick={() => handleViewPdf(doc.id, doc.fileName || doc.title)}
                                className="erp-btn-secondary py-1 px-2 text-[10px] text-blue-700"
                                title="View original PDF"
                              >
                                <FileText className="w-3 h-3 mr-1" />
                                <span>View PDF</span>
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Library filters */}
              <div className="erp-card space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={qbSearch}
                    onChange={(e) => setQbSearch(e.target.value)}
                    placeholder="Search text or question ID..."
                    className="erp-input text-xs py-1.5 w-56"
                  />
                  <SearchableSubjectSelect
                    subjects={qbSubjectOptions}
                    value={qbSubjectFilter}
                    onChange={(val) => {
                      setQbSubjectFilter(val);
                      setQbTopicFilter('ALL');
                    }}
                    includeAllOption
                    allOptionLabel="All Subjects"
                    placeholder="All Subjects"
                    size="sm"
                    className="w-56"
                  />
                  <select value={qbTopicFilter} onChange={(e) => setQbTopicFilter(e.target.value)} className="erp-select text-xs py-1.5">
                    <option value="ALL">All Topics</option>
                    {qbTopicOptions.map((t: any) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <select value={qbTypeFilter} onChange={(e) => setQbTypeFilter(e.target.value)} className="erp-select text-xs py-1.5">
                    <option value="ALL">All Types</option>
                    <option value="MCQ">MCQ</option>
                    <option value="MSQ">MSQ</option>
                    <option value="NAT">NAT</option>
                  </select>
                  <select value={qbDifficultyFilter} onChange={(e) => setQbDifficultyFilter(e.target.value)} className="erp-select text-xs py-1.5">
                    <option value="ALL">All Difficulties</option>
                    <option value="EASY">Easy</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HARD">Hard</option>
                  </select>
                  <select value={qbVerificationFilter} onChange={(e) => setQbVerificationFilter(e.target.value)} className="erp-select text-xs py-1.5">
                    <option value="ALL">All Verification</option>
                    <option value="VERIFIED">Verified</option>
                    <option value="NEEDS_REVIEW">Needs Review</option>
                    <option value="UNANSWERED_IN_SOURCE">Unanswered in Source</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                  <select value={qbOriginFilter} onChange={(e) => setQbOriginFilter(e.target.value)} className="erp-select text-xs py-1.5">
                    <option value="ALL">Source + AI Generated</option>
                    <option value="SOURCE">Source Only</option>
                    <option value="AI_GENERATED">AI Generated Only</option>
                  </select>
                  {(qbSearch || qbSubjectFilter !== 'ALL' || qbTopicFilter !== 'ALL' || qbTypeFilter !== 'ALL' || qbDifficultyFilter !== 'ALL' || qbVerificationFilter !== 'ALL' || qbOriginFilter !== 'ALL') && (
                    <button
                      onClick={() => { setQbSearch(''); setQbSubjectFilter('ALL'); setQbTopicFilter('ALL'); setQbTypeFilter('ALL'); setQbDifficultyFilter('ALL'); setQbVerificationFilter('ALL'); setQbOriginFilter('ALL'); }}
                      className="text-xs text-blue-700 hover:underline"
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 font-mono">{individualQuestions.length} of {questions.length} questions shown</p>
              </div>

              {/* Bulk action toolbar — appears only when one or more questions are selected */}
              {selectedQuestionIds.size > 0 && (
                <div className="erp-card flex flex-wrap items-center justify-between gap-2 border-l-4 border-l-red-500 bg-red-50/40">
                  <span className="text-xs font-bold text-slate-900">
                    ✓ {selectedQuestionIds.size} question{selectedQuestionIds.size === 1 ? '' : 's'} selected
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const selected = individualQuestions.filter((q: any) => selectedQuestionIds.has(q.id));
                        const unverified = selected.filter((q: any) => q.verificationStatus !== 'VERIFIED');
                        if (unverified.length > 0) {
                          showToast(`${unverified.length} selected question(s) aren't VERIFIED yet — only VERIFIED questions can enter an examination.`);
                          return;
                        }
                        setBuilderInitialQuestions(selected);
                        setQuestionBankView('BUILDER');
                      }}
                      className="erp-btn-primary py-1 px-3 text-[11px]"
                    >
                      Create Examination From Selected
                    </button>
                    <button
                      onClick={() => setIsBulkDeleteConfirmOpen(true)}
                      className="erp-btn-danger py-1 px-3 text-[11px]"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      <span>Delete Selected</span>
                    </button>
                    <button
                      onClick={handleClearSelection}
                      className="erp-btn-secondary py-1 px-3 text-[11px]"
                    >
                      Clear Selection
                    </button>
                  </div>
                </div>
              )}

              <div className="erp-table-container">
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th className="w-8">
                        <input
                          type="checkbox"
                          className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={individualQuestions.length > 0 && individualQuestions.every((q: any) => selectedQuestionIds.has(q.id))}
                          ref={(el) => {
                            if (el) {
                              const visibleCount = individualQuestions.length;
                              const selectedVisibleCount = individualQuestions.filter((q: any) => selectedQuestionIds.has(q.id)).length;
                              el.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleCount;
                            }
                          }}
                          onChange={handleToggleSelectAllVisible}
                          title="Select all questions matching the current filters"
                        />
                      </th>
                      <th>Question Code</th>
                      <th>Question Statement</th>
                      <th>Subject / Topic</th>
                      <th>Type</th>
                      <th>Difficulty</th>
                      <th>Origin</th>
                      <th>Verification</th>
                      <th>Source</th>
                      <th>Marks</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {individualQuestions.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-8 text-center text-slate-500">
                          No questions match the current filters.
                        </td>
                      </tr>
                    ) : (
                      individualQuestions.map((q: any) => (
                        <tr
                          key={q.id}
                          className={`cursor-pointer ${selectedQuestionIds.has(q.id) ? 'bg-blue-50/40' : ''}`}
                          onClick={() => setQbDetailQuestion(q)}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                              checked={selectedQuestionIds.has(q.id)}
                              onChange={() => handleToggleSelectQuestion(q.id)}
                            />
                          </td>
                          <td className="font-mono font-bold text-[#1E40AF]">{q.customId || q.id.slice(0, 8)}</td>
                          <td className="font-semibold text-slate-900 max-w-xs truncate">
                            <div className="flex items-center gap-1.5">
                              {(q.imageUrl || q.containsFigure) && (
                                <span title="Contains Figure / Diagram" className="text-xs px-1 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 shrink-0 font-sans font-normal">
                                  FIG
                                </span>
                              )}
                              <span className="truncate">
                                {typeof q.text === 'string' && q.text.trim() ? (
                                  q.text.trim()
                                ) : (
                                  <span className="italic text-slate-500 font-normal">[Image-First Question]</span>
                                )}
                              </span>
                            </div>
                          </td>
                          <td className="text-xs text-slate-600 max-w-[10rem] truncate">
                            {q.subtopic?.topic?.module?.subject?.name || '—'}
                            {q.subtopic?.topic?.name ? <span className="block text-[10px] text-slate-400">{q.subtopic.topic.name}</span> : null}
                          </td>
                          <td><span className="erp-badge-gray">{q.type}</span></td>
                          <td><span className="erp-badge-gray">{q.difficulty}</span></td>
                          <td>
                            <span className={`erp-badge-${(q.aiSources && q.aiSources.length > 0) || q.origin === 'AI_GENERATED' ? 'blue' : 'gray'}`}>
                              {(q.aiSources && q.aiSources.length > 0) || q.origin === 'AI_GENERATED' ? 'AI_GENERATED' : 'SOURCE'}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`erp-badge-${
                                q.verificationStatus === 'VERIFIED'
                                  ? 'green'
                                  : q.verificationStatus === 'NEEDS_REVIEW'
                                  ? 'amber'
                                  : q.verificationStatus === 'REJECTED'
                                  ? 'red'
                                  : 'gray'
                              }`}
                            >
                              {q.verificationStatus || '—'}
                            </span>
                          </td>
                          <td className="text-xs text-slate-500 font-mono">
                            {q.sourcePage ? `Pg ${q.sourcePage}` : '—'}
                            {q.sourceHeading ? <span className="block text-[10px] text-slate-400 truncate max-w-[8rem]">{q.sourceHeading}</span> : null}
                          </td>
                          <td className="font-bold font-mono text-emerald-700">+{q.marks}</td>
                          <td onClick={(e) => e.stopPropagation()}>
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
                              <button
                                disabled={deletingQuestionId === q.id}
                                onClick={() => handleDeleteQuestion(q.id)}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                                title="Delete Question"
                              >
                                <Trash2 className={`w-3.5 h-3.5 ${deletingQuestionId === q.id ? 'animate-spin' : ''}`} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              </>
              )}

              {questionBankView === 'IMPORT' && (
                <QuestionBankImportPanel
                  pdfTargetCount={pdfTargetCount}
                  setPdfTargetCount={setPdfTargetCount}
                  onQuestionFileUpload={handleQuestionFileUpload}
                  pdfImportJob={pdfImportJob}
                  onDismissPdfImportJob={() => setPdfImportJob(null)}
                  onImportComplete={() => { fetchInitialData(); setQuestionBankView('LIBRARY'); }}
                />
              )}
            </div>
          )}

          {/* TAB 4: STUDENTS */}
          {activeTab === 'STUDENTS' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-60 max-w-full">
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
                    {citDepartments.map((dept) => (
                      <option key={dept.id} value={dept.name}>
                        {dept.code} - {dept.name}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => setStudentSortOrder(studentSortOrder === 'ASC' ? 'DESC' : 'ASC')}
                    className="erp-btn-secondary h-8 py-1.5 px-3 text-xs font-medium whitespace-nowrap"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5" />
                    <span>Sort ({studentSortOrder})</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto ml-auto">
                  <label className="erp-btn-secondary h-8 py-1.5 px-3 text-xs font-medium whitespace-nowrap cursor-pointer">
                    <span>Import Roster</span>
                    <input type="file" accept=".xlsx,.xls,.csv" onChange={handleStudentFileUpload} className="hidden" />
                  </label>
                  <button
                    onClick={() => handleExportCSV('Students', filteredStudents)}
                    className="erp-btn-secondary h-8 py-1.5 px-3 text-xs font-medium whitespace-nowrap"
                  >
                    Export CSV
                  </button>
                  <button
                    onClick={() => handleExportPDF('Students')}
                    className="erp-btn-secondary h-8 py-1.5 px-3 text-xs font-medium whitespace-nowrap"
                  >
                    Export PDF
                  </button>
                  <button
                    onClick={() => setIsAddStudentOpen(true)}
                    className="erp-btn-primary h-8 py-1.5 px-3 text-xs font-medium whitespace-nowrap border border-transparent"
                  >
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
                      <th>Can Create Exams</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faculty.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
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
                            <button
                              onClick={() => handleToggleExamPermission(f.id, !f.canCreateExams)}
                              title={f.canCreateExams ? 'Click to revoke exam-creation permission' : 'Click to grant exam-creation permission'}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                f.canCreateExams ? 'bg-emerald-600' : 'bg-slate-300'
                              }`}
                            >
                              <span
                                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                  f.canCreateExams ? 'translate-x-4' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </td>
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <Building className="w-4 h-4 text-[#1E40AF]" />
                      Academic Departments
                    </h3>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                      {CURRENT_INSTITUTION.name} ({CURRENT_INSTITUTION.code})
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Centralized department directory, code designations, and live student counts for {CURRENT_INSTITUTION.name}.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={() => {
                      setDeptFormData({
                        code: '',
                        name: '',
                        collegeId: CURRENT_INSTITUTION.id,
                        active: true,
                      });
                      setIsAddDeptOpen(true);
                    }}
                    className="erp-btn-primary py-1.5 px-3 text-xs font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Department</span>
                  </button>
                </div>
              </div>

              {citDepartments.length === 0 ? (
                <div className="erp-card text-center py-12 text-slate-500 text-xs space-y-2">
                  <Building className="w-8 h-8 text-slate-300 mx-auto" />
                  <div className="font-semibold text-slate-700">No departments found for {CURRENT_INSTITUTION.name}.</div>
                  <div>Click &quot;Add Department&quot; above to create a new academic department.</div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {citDepartments.map((dept) => {
                    const studentCount =
                      dept.studentCount !== undefined
                        ? dept.studentCount
                        : students.filter((s: any) =>
                            s.department === dept.name ||
                            s.department === dept.code ||
                            getDepartmentCode(s.department) === dept.code
                          ).length;

                    return (
                      <div key={dept.id} className="erp-card space-y-3 flex flex-col justify-between hover:border-blue-300 transition-colors">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="erp-badge-blue font-mono font-bold shrink-0">{dept.code}</span>
                              {dept.active ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                  Inactive
                                </span>
                              )}
                            </div>
                            <span className="text-xs font-bold text-emerald-700 whitespace-nowrap shrink-0">
                              {studentCount} Students
                            </span>
                          </div>

                          <h4 className="text-sm font-bold text-slate-900 break-words">{dept.name}</h4>

                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-0.5">
                            <Building className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate">{CURRENT_INSTITUTION.name}</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1 text-xs">
                          <button
                            onClick={() => handleToggleDepartmentStatus(dept)}
                            className={`text-[11px] font-semibold px-2 py-1 rounded transition-colors ${
                              dept.active
                                ? 'text-amber-700 hover:bg-amber-50'
                                : 'text-emerald-700 hover:bg-emerald-50'
                            }`}
                            title={dept.active ? 'Deactivate Department' : 'Activate Department'}
                          >
                            {dept.active ? 'Deactivate' : 'Activate'}
                          </button>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setEditingDept(dept);
                                setDeptFormData({
                                  code: dept.code,
                                  name: dept.name,
                                  collegeId: dept.collegeId || CURRENT_INSTITUTION.id,
                                  active: dept.active,
                                });
                              }}
                              className="text-slate-600 hover:text-blue-700 hover:bg-slate-100 p-1.5 rounded transition-colors"
                              title="Edit Department"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => setDeletingDept(dept)}
                              className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition-colors"
                              title="Delete Department"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 7: REPORTS */}
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

          {activeTab === 'SETTINGS' && (
            <div className="erp-card space-y-4 max-w-lg">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">System Governance Settings</h3>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Restricted Email Domain</label>
                  <input type="text" value="citchennai.net" readOnly className="erp-input font-mono bg-slate-100" />
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
            // No dark padded shell here — the assistant renders its own chrome, and the Question
            // Generator mode needs the full width rather than sitting inside a nested dark card.
            <AIExaminationAssistant role="ADMIN" />
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Target Department</label>
                  <select
                    value={newExamForm.targetDepartment}
                    onChange={(e) => setNewExamForm({ ...newExamForm, targetDepartment: e.target.value })}
                    className="erp-select w-full"
                  >
                    {allActiveDepartments.map((dept) => (
                      <option key={dept.id} value={dept.name}>
                        {dept.name} ({dept.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Target Semester *</label>
                  <select
                    value={newExamForm.targetSemester}
                    onChange={(e) => setNewExamForm({ ...newExamForm, targetSemester: e.target.value })}
                    className="erp-select w-full"
                  >
                    {ACADEMIC_SEMESTERS.map((sem) => (
                      <option key={sem.id} value={sem.value}>
                        {sem.label} (Year {sem.year})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Number of Questions</label>
                  <input
                    type="number"
                    min={0}
                    value={newExamForm.questionCount}
                    onChange={(e) => setNewExamForm({ ...newExamForm, questionCount: e.target.value })}
                    placeholder="e.g. 25"
                    className="erp-input font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Question Source</label>
                  <select
                    value={newExamForm.sourceDocumentId}
                    onChange={(e) => setNewExamForm({ ...newExamForm, sourceDocumentId: e.target.value })}
                    className="erp-select w-full"
                  >
                    <option value="">All Questions</option>
                    {questionBankDocuments.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.fileName || doc.title} ({doc.questionCount})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 -mt-1">
                Leave Number of Questions blank to create the exam shell without attaching questions. When set,
                that many questions are picked at random from the selected source.
              </p>
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
                <button type="submit" className="erp-btn-primary py-1.5 text-xs">Create Draft Examination</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Exam Preview & Pre-Publish Validation */}
      <ExamPreviewModal
        isOpen={!!selectedExamPreview}
        onClose={() => setSelectedExamPreview(null)}
        mockTestId={selectedExamPreview?.id}
        initialMockTest={selectedExamPreview}
        onPublished={() => {
          fetchInitialData();
          setSelectedExamPreview(null);
        }}
      />

      {/* Add Student Modal */}
      {isAddStudentOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="erp-card max-w-md w-full space-y-4 max-h-[90vh] overflow-y-auto my-auto">
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
                  placeholder="ganesh@citchennai.net"
                  className="erp-input"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Department *</label>
                <select
                  value={newStudent.department}
                  onChange={(e) => setNewStudent({ ...newStudent, department: e.target.value })}
                  required
                  className="erp-select w-full"
                >
                  <option value="" disabled>Select Department</option>
                  {allActiveDepartments.map((dept) => (
                    <option key={dept.id} value={dept.name}>
                      {dept.code} - {dept.name}
                    </option>
                  ))}
                </select>
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
                  placeholder="sabitha@citchennai.net"
                  className="erp-input"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Department *</label>
                <select
                  value={newFaculty.department}
                  onChange={(e) => setNewFaculty({ ...newFaculty, department: e.target.value })}
                  required
                  className="erp-select w-full"
                >
                  {allActiveDepartments.map((dept) => (
                    <option key={dept.id} value={dept.name}>
                      {dept.code} - {dept.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setIsAddFacultyOpen(false)} className="erp-btn-secondary py-1.5 text-xs">Cancel</button>
                <button type="submit" className="erp-btn-primary py-1.5 text-xs">Save Faculty</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Department Modal */}
      {isAddDeptOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="erp-card max-w-md w-full space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold text-slate-900">Add Academic Department</h3>
              <button onClick={() => setIsAddDeptOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateDepartment} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Department Code *</label>
                <input
                  type="text"
                  value={deptFormData.code}
                  onChange={(e) => setDeptFormData({ ...deptFormData, code: e.target.value.toUpperCase() })}
                  required
                  placeholder="e.g. BME, AI&DS, CSE"
                  className="erp-input font-mono uppercase"
                />
                <p className="text-[10px] text-slate-500 mt-0.5">Short abbreviation shown on badges and student cards</p>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Department Full Name *</label>
                <input
                  type="text"
                  value={deptFormData.name}
                  onChange={(e) => setDeptFormData({ ...deptFormData, name: e.target.value })}
                  required
                  placeholder="e.g. Biomedical Engineering"
                  className="erp-input"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Institution</label>
                <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded text-slate-700 text-xs font-medium">
                  <Building className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>{CURRENT_INSTITUTION.name} ({CURRENT_INSTITUTION.code})</span>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="addDeptActive"
                  checked={deptFormData.active}
                  onChange={(e) => setDeptFormData({ ...deptFormData, active: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="addDeptActive" className="text-slate-700 font-medium cursor-pointer">
                  Active for student enrollment and examination scheduling
                </label>
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddDeptOpen(false)}
                  className="erp-btn-secondary py-1.5 text-xs"
                >
                  Cancel
                </button>
                <button type="submit" className="erp-btn-primary py-1.5 text-xs">
                  Save Department
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Department Modal */}
      {editingDept && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="erp-card max-w-md w-full space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold text-slate-900">Edit Academic Department</h3>
              <button onClick={() => setEditingDept(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleUpdateDepartment} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Department Code *</label>
                <input
                  type="text"
                  value={deptFormData.code}
                  onChange={(e) => setDeptFormData({ ...deptFormData, code: e.target.value.toUpperCase() })}
                  required
                  placeholder="e.g. CSE"
                  className="erp-input font-mono uppercase"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Department Full Name *</label>
                <input
                  type="text"
                  value={deptFormData.name}
                  onChange={(e) => setDeptFormData({ ...deptFormData, name: e.target.value })}
                  required
                  placeholder="e.g. Computer Science and Engineering"
                  className="erp-input"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Institution</label>
                <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded text-slate-700 text-xs font-medium">
                  <Building className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>{CURRENT_INSTITUTION.name} ({CURRENT_INSTITUTION.code})</span>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editDeptActive"
                  checked={deptFormData.active}
                  onChange={(e) => setDeptFormData({ ...deptFormData, active: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="editDeptActive" className="text-slate-700 font-medium cursor-pointer">
                  Active for student enrollment and examination scheduling
                </label>
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingDept(null)}
                  className="erp-btn-secondary py-1.5 text-xs"
                >
                  Cancel
                </button>
                <button type="submit" className="erp-btn-primary py-1.5 text-xs">
                  Update Department
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Department Confirmation Modal */}
      {deletingDept && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="erp-card max-w-md w-full space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold text-slate-900">Delete Department</h3>
              <button onClick={() => setDeletingDept(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            {(deletingDept.studentCount || 0) > 0 ? (
              <div className="space-y-3 text-xs">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-800 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    Cannot Delete Department with Enrolled Students
                  </div>
                  <p>
                    Department <strong>{deletingDept.name} ({deletingDept.code})</strong> currently has{' '}
                    <strong>{deletingDept.studentCount} enrolled student(s)</strong>.
                  </p>
                  <p className="text-[11px] text-amber-700">
                    To maintain academic audit records and examination broadsheets, departments with enrolled students cannot be deleted. You can deactivate the department instead so no new students or exams can be assigned to it.
                  </p>
                </div>
                <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setDeletingDept(null)}
                    className="erp-btn-secondary py-1.5 text-xs"
                  >
                    Close
                  </button>
                  {deletingDept.active && (
                    <button
                      type="button"
                      onClick={() => {
                        handleToggleDepartmentStatus(deletingDept);
                        setDeletingDept(null);
                      }}
                      className="erp-btn-primary py-1.5 text-xs"
                    >
                      Deactivate Department
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <p className="text-slate-700">
                  Are you sure you want to delete department <strong>{deletingDept.name} ({deletingDept.code})</strong>?
                </p>
                <p className="text-slate-500 text-[11px]">
                  This department has 0 enrolled students. Deleting it will permanently remove it from the institution catalog.
                </p>
                <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setDeletingDept(null)}
                    className="erp-btn-secondary py-1.5 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteDepartment}
                    className="erp-btn-danger py-1.5 text-xs"
                  >
                    Confirm Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {/* Question Bank Library — detail modal */}
      {qbDetailQuestion && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4" onClick={() => setQbDetailQuestion(null)}>
          <div className="erp-card max-w-2xl w-full max-h-[85vh] overflow-y-auto space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-bold text-[#1E40AF] font-mono">{qbDetailQuestion.customId || qbDetailQuestion.id}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {qbDetailQuestion.subtopic?.topic?.module?.subject?.name || 'General'}
                  {qbDetailQuestion.subtopic?.topic?.name ? ` → ${qbDetailQuestion.subtopic.topic.name}` : ''}
                </p>
              </div>
              <button onClick={() => setQbDetailQuestion(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="erp-badge-gray">{qbDetailQuestion.type}</span>
              <span className="erp-badge-gray">{qbDetailQuestion.difficulty}</span>
              <span className={`erp-badge-${(qbDetailQuestion.aiSources && qbDetailQuestion.aiSources.length > 0) || qbDetailQuestion.origin === 'AI_GENERATED' ? 'blue' : 'gray'}`}>
                {(qbDetailQuestion.aiSources && qbDetailQuestion.aiSources.length > 0) || qbDetailQuestion.origin === 'AI_GENERATED' ? 'AI_GENERATED' : 'SOURCE'}
              </span>
              <span
                className={`erp-badge-${
                  qbDetailQuestion.verificationStatus === 'VERIFIED'
                    ? 'green'
                    : qbDetailQuestion.verificationStatus === 'NEEDS_REVIEW'
                    ? 'amber'
                    : qbDetailQuestion.verificationStatus === 'REJECTED'
                    ? 'red'
                    : 'gray'
                }`}
              >
                {qbDetailQuestion.verificationStatus || 'UNKNOWN'}
              </span>
            </div>

            {/* Image-First Question & Options Rendering */}
            <QuestionRenderer
              question={qbDetailQuestion}
              showCorrectAnswer={true}
              onZoomImage={(url, title) => setZoomedImage({ url, title })}
              viewMode="QUESTION_BANK"
              showInternalMetadata={true}
            />

            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs flex items-center justify-between">
              <span className="font-bold text-slate-700">Correct Answer: </span>
              <span className="font-mono text-emerald-700 font-bold">
                {Array.isArray(qbDetailQuestion.correctAnswer) && qbDetailQuestion.correctAnswer.length > 0
                  ? JSON.stringify(qbDetailQuestion.correctAnswer)
                  : String(qbDetailQuestion.correctAnswer ?? qbDetailQuestion.rawAnswer ?? 'N/A')}
              </span>
            </div>

            {qbDetailQuestion.explanation && (
              <div className="p-2.5 bg-blue-50/50 border border-blue-200/60 rounded text-xs text-slate-700">
                <span className="font-bold text-[#1E40AF]">Explanation: </span>
                {qbDetailQuestion.explanation}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-slate-200">
              <div><span className="font-bold text-slate-700">Marks: </span>{qbDetailQuestion.marks}</div>
              <div><span className="font-bold text-slate-700">Negative Marks: </span>{qbDetailQuestion.negativeMarks ?? 0}</div>
              <div><span className="font-bold text-slate-700">Source Document: </span>{qbDetailQuestion.sourceDocument?.title || qbDetailQuestion.sourceDocument?.fileName || qbDetailQuestion.sourceDocumentId || '—'}</div>
              <div><span className="font-bold text-slate-700">Source Page: </span>{qbDetailQuestion.sourcePage || '—'}</div>
              <div><span className="font-bold text-slate-700">Source Chapter: </span>{qbDetailQuestion.sourceChapter || '—'}</div>
              <div><span className="font-bold text-slate-700">Source Section: </span>{qbDetailQuestion.sourceSection || '—'}</div>
              <div className="col-span-2"><span className="font-bold text-slate-700">Source Heading: </span>{qbDetailQuestion.sourceHeading || '—'}</div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setQbDetailQuestion(null)}
                className="erp-btn-secondary py-1.5 px-4 text-xs"
              >
                Close
              </button>
              <div className="flex items-center gap-2">
                {qbDetailQuestion.verificationStatus !== 'VERIFIED' ? (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await api.post('/admin/questions/bulk-status', { ids: [qbDetailQuestion.id], verificationStatus: 'VERIFIED' });
                        showToast('Question marked VERIFIED');
                        setQbDetailQuestion({ ...qbDetailQuestion, verificationStatus: 'VERIFIED' });
                        fetchInitialData();
                      } catch {
                        showToast('Failed to update verification status');
                      }
                    }}
                    className="erp-btn-primary py-1.5 px-4 text-xs bg-emerald-700 hover:bg-emerald-800"
                  >
                    ✓ Approve & Mark VERIFIED
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await api.post('/admin/questions/bulk-status', { ids: [qbDetailQuestion.id], verificationStatus: 'NEEDS_REVIEW' });
                        showToast('Question marked NEEDS_REVIEW');
                        setQbDetailQuestion({ ...qbDetailQuestion, verificationStatus: 'NEEDS_REVIEW' });
                        fetchInitialData();
                      } catch {
                        showToast('Failed to update verification status');
                      }
                    }}
                    className="erp-btn-secondary py-1.5 px-4 text-xs text-amber-800 bg-amber-50 border-amber-300"
                  >
                    Mark Needs Review
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isBulkDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="erp-card max-w-md w-full space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold text-slate-900">Delete {selectedQuestionIds.size} selected question{selectedQuestionIds.size === 1 ? '' : 's'}?</h3>
              <button
                onClick={() => setIsBulkDeleteConfirmOpen(false)}
                disabled={isBulkDeleting}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              This action will permanently remove the selected questions from the Question Bank. Questions currently used in an examination will be skipped and reported, not deleted.
            </p>
            <div className="flex justify-end items-center gap-2 pt-1">
              <button
                onClick={() => setIsBulkDeleteConfirmOpen(false)}
                disabled={isBulkDeleting}
                className="erp-btn-secondary py-1.5 px-4 text-xs disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDeleteQuestions}
                disabled={isBulkDeleting}
                className="erp-btn-danger py-1.5 px-4 text-xs disabled:opacity-50"
              >
                {isBulkDeleting ? 'Deleting...' : 'Delete Questions'}
              </button>
            </div>
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

      {/* Fullscreen Image Lightbox / Zoom Modal */}
      {zoomedImage && (
        <div className="fixed inset-0 z-[160] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4">
          <div className="absolute top-4 right-4 flex items-center gap-3">
            {zoomedImage.title && (
              <span className="text-white text-xs font-semibold font-mono bg-slate-800 px-3 py-1 rounded border border-slate-700">
                {zoomedImage.title}
              </span>
            )}
            <button
              onClick={() => setZoomedImage(null)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full transition-colors"
              title="Close Image Zoom"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="max-w-5xl max-h-[85vh] overflow-auto p-3 bg-white rounded-lg shadow-2xl flex items-center justify-center border border-slate-700">
            <img
              src={zoomedImage.url}
              alt={zoomedImage.title || 'Enlarged Figure'}
              className="max-w-full max-h-[80vh] object-contain rounded"
            />
          </div>
          <p className="text-slate-400 text-xs mt-3">Click X or backdrop to close zoom view</p>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-3 px-6 text-center text-xs text-slate-500 mt-auto">
        © 2026 {CURRENT_INSTITUTION.name} ({CURRENT_INSTITUTION.code}) • Office of the Controller of Examinations • Version 2.0
      </footer>
    </div>
  );
}
