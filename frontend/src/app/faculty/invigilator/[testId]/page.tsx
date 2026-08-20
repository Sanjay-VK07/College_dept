'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  GraduationCap,
  Radio,
  AlertTriangle,
  CheckCircle2,
  Download,
  LogOut,
  Plus,
  Search,
  Filter,
  Users,
  BookOpen,
  Clock,
  Award,
  FileSpreadsheet,
  Trash2,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  FileText,
  Bot,
  LayoutGrid,
} from 'lucide-react';
import io from 'socket.io-client';
import api from '@/lib/api';
import { RiskTierTable, LiveStudent } from '@/components/invigilator/RiskTierTable';
import { AIExaminationAssistant } from '@/components/ai/AIExaminationAssistant';

export default function InvigilatorDashboard() {
  const router = useRouter();
  const params = useParams();
  const testId = (params.testId as string) || 'test-demo-123';

  const [students, setStudents] = useState<LiveStudent[]>([]);
  const [testTitle, setTestTitle] = useState('CS8601 Database Management Systems - Mid-Semester CBT Assessment');
  const [socketConnected, setSocketConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'OVERVIEW' | 'LIVE' | 'CREATE_EXAM' | 'QUESTION_BANK' | 'STUDENT_ROSTER' | 'ATTENDANCE' | 'RESULTS' | 'REPORTS' | 'AI_ASSISTANT'
  >('OVERVIEW');

  const socketRef = useRef<any>(null);

  // Form State: Create Exam
  const [newExam, setNewExam] = useState({
    title: '',
    code: '',
    department: 'Computer Science & Engineering',
    durationMinutes: '180',
    totalMarks: '100',
    maxViolations: '5',
  });
  const [createSuccess, setCreateSuccess] = useState('');
  const [createError, setCreateError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Question Bank Mock List & Filter
  const [questionSearch, setQuestionSearch] = useState('');
  const [questionTypeFilter, setQuestionTypeFilter] = useState('ALL');
  const [questionsList, setQuestionsList] = useState([
    {
      id: 'q1',
      code: 'CS8601-01',
      type: 'MCQ',
      text: 'Which normal form eliminates transitive functional dependency in relational database design?',
      marks: 2,
      difficulty: 'MEDIUM',
      subject: 'Database Management Systems',
    },
    {
      id: 'q2',
      code: 'CS8601-02',
      text: 'Calculate the total number of block transfers required for B+ tree search with node capacity 100.',
      type: 'NAT',
      marks: 2,
      difficulty: 'HARD',
      subject: 'Database Management Systems',
    },
    {
      id: 'q3',
      code: 'CS8601-03',
      text: 'Select all ACID properties guaranteed by transaction processing systems.',
      type: 'MSQ',
      marks: 2,
      difficulty: 'EASY',
      subject: 'Database Management Systems',
    },
  ]);

  // Attendance Register Dataset (strictly scoped to testId)
  const [attendanceList, setAttendanceList] = useState<any[]>([]);
  const [examMeta, setExamMeta] = useState<any>(null);
  const [examNotFound, setExamNotFound] = useState(false);

  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';
    const token = localStorage.getItem('gsmas_token');
    const socket = io(socketUrl, {
      auth: { token }
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('join_faculty_room', { testId });
    });

    socket.on('live_students_snapshot', (snapshot: LiveStudent[]) => {
      setStudents(snapshot);
    });

    socket.on('student_status_changed', (student: LiveStudent) => {
      setStudents((prev) => {
        const idx = prev.findIndex((s) => s.assignmentId === student.assignmentId);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = student;
          return copy;
        }
        return [...prev, student];
      });
    });

    socket.on('student_progress_updated', (data: any) => {
      setStudents((prev) =>
        prev.map((s) =>
          s.assignmentId === data.assignmentId
            ? { ...s, currentQuestion: data.currentQuestion, remainingSec: data.remainingSec, status: data.status }
            : s
        )
      );
    });

    socket.on('student_violation_logged', (vData: any) => {
      setStudents((prev) =>
        prev.map((s) =>
          s.assignmentId === vData.assignmentId
            ? { ...s, violationCount: vData.violationCount, riskLevel: vData.riskLevel }
            : s
        )
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [testId]);

  const handleSendWarning = (assignmentId: string, message: string) => {
    if (socketRef.current) {
      socketRef.current.emit('faculty_send_warning', { assignmentId, message });
    }
  };

  const handleForceSubmit = (assignmentId: string) => {
    if (confirm('Are you sure you want to remotely terminate and submit this student examination paper?')) {
      if (socketRef.current) {
        socketRef.current.emit('faculty_force_submit', {
          assignmentId,
          reason: 'Invigilator issued manual termination due to security infraction.',
        });
      }
    }
  };

  const handleExportReport = (format: string) => {
    const token = localStorage.getItem('gsmas_token');
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    window.open(`${apiUrl}/admin/export-report/${testId}?format=${format}&token=${token}`, '_blank');
  };

  const [dbStudents, setDbStudents] = useState<any[]>([]);
  const [dbResults, setDbResults] = useState<any[]>([]);
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [examsList, setExamsList] = useState<any[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    fetchFacultyData();
    fetchAttendanceData();
  }, [testId]);

  const fetchAttendanceData = async () => {
    if (!testId) return;
    setExamNotFound(false);
    try {
      const res = await api.get(`/admin/attendance/${testId}`);
      if (res.data?.success && res.data?.data) {
        setAttendanceList(res.data.data.attendance || []);
        if (res.data.data.exam) {
          setExamMeta(res.data.data.exam);
          if (res.data.data.exam.title) {
            setTestTitle(res.data.data.exam.title);
          }
        }
      } else {
        setAttendanceList([]);
        setExamNotFound(true);
      }
    } catch (err: any) {
      console.error('Error loading attendance for exam:', testId, err);
      setAttendanceList([]);
      if (err.response?.status === 404) {
        setExamNotFound(true);
      }
    }
  };

  const fetchFacultyData = async () => {
    setStatsLoading(true);
    try {
      const [qRes, sRes, rRes, overviewRes, examsRes] = await Promise.all([
        api.get('/admin/questions'),
        api.get('/admin/students'),
        api.get('/admin/results-ledger'),
        api.get('/admin/overview'),
        api.get('/admin/exams'),
      ]);
      if (qRes.data?.success) setQuestionsList(qRes.data.data);
      if (sRes.data?.success) setDbStudents(sRes.data.data);
      if (rRes.data?.success) setDbResults(rRes.data.data);
      if (overviewRes.data?.success) setDashboardStats(overviewRes.data.data);
      if (examsRes.data?.success) setExamsList(examsRes.data.data);
    } catch (e) {
      console.error('Error loading faculty datasets:', e);
    } finally {
      setStatsLoading(false);
    }
  };

  const handleStatusTransition = async (examId: string, newStatus: string) => {
    try {
      const res = await api.put(`/admin/exams/${examId}/status`, { status: newStatus });
      if (res.data?.success) {
        await fetchFacultyData();
        if (examId === testId) {
          await fetchAttendanceData();
        }
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update exam status.');
    }
  };

  const handleCreateExamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateSuccess('');
    setCreateError('');

    if (!newExam.title.trim() || !newExam.code.trim()) {
      setCreateError('Please complete all mandatory examination fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post('/admin/exams', {
        title: `${newExam.code} ${newExam.title}`,
        description: `Examination paper for ${newExam.department}`,
        examType: 'SCHEDULED',
        durationMinutes: Number(newExam.durationMinutes) || 180,
        totalMarks: Number(newExam.totalMarks) || 100,
        targetDepartment: newExam.department,
        maxViolations: Number(newExam.maxViolations) || 5,
        instructions: '1. Duration: 180 Minutes.\n2. Fullscreen mode enforced.',
      });

      if (res.data?.success) {
        setCreateSuccess('Examination paper created and scheduled successfully in Controller of Examinations database.');
        setNewExam({
          title: '',
          code: '',
          department: 'Computer Science & Engineering',
          durationMinutes: '180',
          totalMarks: '100',
          maxViolations: '5',
        });
      }
    } catch (err: any) {
      setCreateError(err.response?.data?.message || 'Failed to create examination paper.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleAttendanceStatus = (registerNo: string) => {
    setAttendanceList((prev) =>
      prev.map((item) =>
        item.registerNo === registerNo
          ? {
              ...item,
              status: item.status === 'PRESENT' ? 'ABSENT' : 'PRESENT',
              checkInTime: item.status === 'PRESENT' ? '-' : '09:30 AM',
            }
          : item
      )
    );
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-sans">
      {/* Top Invigilator Navbar */}
      <header className="bg-[#1E40AF] text-white border-b border-blue-900 px-6 py-3.5 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white/10 rounded-md border border-white/20">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base font-bold text-white tracking-tight">{testTitle}</h1>
                <span className="erp-badge-green font-mono text-[11px]">
                  {socketConnected ? '● Live Gateway Connected' : 'Connecting...'}
                </span>
              </div>
              <p className="text-xs text-blue-200">Faculty Invigilation & Assessment Governance Portal</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => handleExportReport('excel')}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded border border-white/20 flex items-center space-x-1 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Report</span>
            </button>

            <button
              onClick={() => router.push('/')}
              title="Sign Out"
              className="p-2 rounded bg-blue-900/60 hover:bg-blue-900 text-blue-200 hover:text-white border border-blue-700 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {examNotFound && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-4 text-xs flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <span className="font-bold text-sm block text-amber-900">Examination Not Found</span>
              <span>
                No examination record matching ID <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded text-amber-900">{testId}</code> was found in the database.
              </span>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex overflow-x-auto border-b border-slate-200 space-x-1 pb-1">
          {[
            { id: 'OVERVIEW', label: 'Dashboard Overview', icon: LayoutGrid },
            { id: 'LIVE', label: 'Live Invigilation Monitor', icon: Radio, badge: students.length },
            { id: 'CREATE_EXAM', label: 'Create Examination', icon: Plus },
            { id: 'QUESTION_BANK', label: 'Question Bank', icon: BookOpen, badge: questionsList.length },
            { id: 'STUDENT_ROSTER', label: 'Candidate Roster', icon: Users },
            { id: 'ATTENDANCE', label: 'Attendance Register', icon: CheckCircle2 },
            { id: 'RESULTS', label: 'Results & Evaluation', icon: Award },
            { id: 'REPORTS', label: 'Reports & Analytics', icon: FileText },
            { id: 'AI_ASSISTANT', label: 'AI Assistant', icon: Bot },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3.5 py-2 text-xs font-semibold rounded-t-md transition-colors flex items-center space-x-2 whitespace-nowrap border-b-2 ${
                  isActive
                    ? 'border-[#1E40AF] text-[#1E40AF] bg-blue-50/50'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${isActive ? 'bg-[#1E40AF] text-white' : 'bg-slate-200 text-slate-700'}`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* TAB 0: DASHBOARD OVERVIEW */}
        {activeTab === 'OVERVIEW' && (
          <div className="space-y-6">
            {/* Stat Widgets */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="erp-card p-4 space-y-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Assigned Exams</span>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-extrabold text-slate-900">{dashboardStats?.assignedExams ?? 0}</span>
                  <span className="text-[10px] text-slate-400">Total papers</span>
                </div>
              </div>
              <div className="erp-card p-4 space-y-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Active Live Session</span>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-extrabold text-emerald-600">{dashboardStats?.liveExams ?? 0}</span>
                  <span className="text-[10px] text-emerald-600 font-semibold animate-pulse">● Live Now</span>
                </div>
              </div>
              <div className="erp-card p-4 space-y-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Assigned Candidates</span>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-extrabold text-slate-900">{dashboardStats?.students ?? 0}</span>
                  <span className="text-[10px] text-slate-400">Registered</span>
                </div>
              </div>
              <div className="erp-card p-4 space-y-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Avg Attendance Rate</span>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-extrabold text-[#1E40AF]">{dashboardStats?.attendanceRate ?? 100}%</span>
                  <span className="text-[10px] text-slate-400">Turnout</span>
                </div>
              </div>
            </div>

            {/* Examinations List Table */}
            <div className="erp-card p-0 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Assigned Institutional Examinations</h3>
                  <p className="text-[11px] text-slate-500">Select an exam to open the live invigilation panel or manage its lifecycle status.</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] uppercase font-bold tracking-wider text-slate-500 border-b border-slate-200">
                      <th className="px-5 py-3">Exam / Course</th>
                      <th className="px-5 py-3">Target Department</th>
                      <th className="px-5 py-3">Duration & Marks</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {examsList.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                          No examinations found. Select "Create Examination" to add a new exam paper.
                        </td>
                      </tr>
                    ) : (
                      examsList.map((exam) => {
                        const statusColors: Record<string, string> = {
                          DRAFT: 'bg-slate-100 text-slate-700',
                          SCHEDULED: 'bg-blue-100 text-blue-800',
                          PUBLISHED: 'bg-amber-100 text-amber-800',
                          LIVE: 'bg-emerald-100 text-emerald-800 animate-pulse',
                          COMPLETED: 'bg-purple-100 text-purple-800',
                          ARCHIVED: 'bg-slate-200 text-slate-800',
                        };

                        return (
                          <tr key={exam.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-3.5">
                              <span className="font-bold text-slate-950 block">{exam.title}</span>
                              <span className="text-[10px] text-slate-400 font-mono block">ID: {exam.id}</span>
                            </td>
                            <td className="px-5 py-3.5 text-slate-600">{exam.targetDepartment}</td>
                            <td className="px-5 py-3.5">
                              <span className="font-semibold text-slate-800 block">{exam.durationMinutes} Mins</span>
                              <span className="text-[10px] text-slate-500 block">{exam.totalMarks} Marks ({exam._count?.testQuestions ?? 0} Questions)</span>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColors[exam.status] || 'bg-slate-100 text-slate-800'}`}>
                                {exam.status}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-right space-x-1 whitespace-nowrap">
                              {/* Status transitions actions */}
                              {exam.status === 'DRAFT' && (
                                <>
                                  <button
                                    onClick={() => handleStatusTransition(exam.id, 'PUBLISHED')}
                                    className="px-2 py-1 bg-amber-600 text-white font-semibold rounded hover:bg-amber-700 transition-colors text-[10px]"
                                  >
                                    Publish
                                  </button>
                                  <button
                                    onClick={() => handleStatusTransition(exam.id, 'SCHEDULED')}
                                    className="px-2 py-1 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 transition-colors text-[10px]"
                                  >
                                    Schedule
                                  </button>
                                </>
                              )}
                              {exam.status === 'SCHEDULED' && (
                                <>
                                  <button
                                    onClick={() => handleStatusTransition(exam.id, 'PUBLISHED')}
                                    className="px-2 py-1 bg-amber-600 text-white font-semibold rounded hover:bg-amber-700 transition-colors text-[10px]"
                                  >
                                    Publish
                                  </button>
                                  <button
                                    onClick={() => handleStatusTransition(exam.id, 'DRAFT')}
                                    className="px-2 py-1 bg-slate-600 text-white font-semibold rounded hover:bg-slate-700 transition-colors text-[10px]"
                                  >
                                    Revert to Draft
                                  </button>
                                </>
                              )}
                              {exam.status === 'PUBLISHED' && (
                                <>
                                  <button
                                    onClick={() => handleStatusTransition(exam.id, 'LIVE')}
                                    className="px-2 py-1 bg-emerald-600 text-white font-semibold rounded hover:bg-emerald-700 transition-colors text-[10px]"
                                  >
                                    Start Live Test
                                  </button>
                                  <button
                                    onClick={() => handleStatusTransition(exam.id, 'DRAFT')}
                                    className="px-2 py-1 bg-slate-600 text-white font-semibold rounded hover:bg-slate-700 transition-colors text-[10px]"
                                  >
                                    Revert to Draft
                                  </button>
                                </>
                              )}
                              {exam.status === 'LIVE' && (
                                <button
                                  onClick={() => handleStatusTransition(exam.id, 'COMPLETED')}
                                  className="px-2 py-1 bg-purple-600 text-white font-semibold rounded hover:bg-purple-700 transition-colors text-[10px]"
                                >
                                  End Exam
                                </button>
                              )}
                              {exam.status === 'COMPLETED' && (
                                <button
                                  onClick={() => handleStatusTransition(exam.id, 'ARCHIVED')}
                                  className="px-2 py-1 bg-slate-700 text-white font-semibold rounded hover:bg-slate-800 transition-colors text-[10px]"
                                >
                                  Archive
                                </button>
                              )}

                              {/* Launch Live Monitor */}
                              <button
                                onClick={() => {
                                  router.push(`/faculty/invigilator/${exam.id}`);
                                  setActiveTab('LIVE');
                                }}
                                className="px-2 py-1 border border-slate-300 text-slate-700 font-semibold rounded hover:bg-slate-50 transition-colors text-[10px]"
                              >
                                Launch Monitor
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: LIVE INVIGILATION MONITOR */}
        {activeTab === 'LIVE' && (
          <RiskTierTable
            students={students}
            onSendWarning={handleSendWarning}
            onForceSubmit={handleForceSubmit}
          />
        )}

        {/* TAB 2: CREATE EXAMINATION */}
        {activeTab === 'CREATE_EXAM' && (
          <div className="max-w-2xl mx-auto erp-card space-y-6">
            <div className="border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Schedule & Create Examination Paper</h3>
              <p className="text-xs text-slate-500">Configure course codes, duration, target departments, and security threshold rules.</p>
            </div>

            {createSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 text-xs text-emerald-800 flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{createSuccess}</span>
              </div>
            )}

            {createError && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-800 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateExamSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Course Code <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={newExam.code}
                    onChange={(e) => setNewExam({ ...newExam, code: e.target.value })}
                    required
                    placeholder="e.g. CS8601"
                    className="erp-input uppercase font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Duration (Minutes) <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    value={newExam.durationMinutes}
                    onChange={(e) => setNewExam({ ...newExam, durationMinutes: e.target.value })}
                    required
                    className="erp-input font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Examination Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={newExam.title}
                  onChange={(e) => setNewExam({ ...newExam, title: e.target.value })}
                  required
                  placeholder="e.g. Database Management Systems - End Semester CBT"
                  className="erp-input"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Total Marks</label>
                  <input
                    type="number"
                    value={newExam.totalMarks}
                    onChange={(e) => setNewExam({ ...newExam, totalMarks: e.target.value })}
                    className="erp-input font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Max Violations Threshold</label>
                  <input
                    type="number"
                    value={newExam.maxViolations}
                    onChange={(e) => setNewExam({ ...newExam, maxViolations: e.target.value })}
                    className="erp-input font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Target Department</label>
                  <select
                    value={newExam.department}
                    onChange={(e) => setNewExam({ ...newExam, department: e.target.value })}
                    className="erp-select w-full"
                  >
                    <option value="Computer Science & Engineering">CSE</option>
                    <option value="Electronics & Communication">ECE</option>
                    <option value="Information Technology">IT</option>
                    <option value="Mechanical Engineering">MECH</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="erp-btn-primary w-full py-2.5 text-xs font-semibold mt-2"
              >
                {isSubmitting ? 'Scheduling Examination...' : 'Schedule & Publish Examination Paper'}
              </button>
            </form>
          </div>
        )}

        {/* TAB 3: QUESTION BANK */}
        {activeTab === 'QUESTION_BANK' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center space-x-2">
                <div className="relative w-64">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={questionSearch}
                    onChange={(e) => setQuestionSearch(e.target.value)}
                    placeholder="Search questions..."
                    className="erp-input pl-9 text-xs py-1.5"
                  />
                </div>
                <select
                  value={questionTypeFilter}
                  onChange={(e) => setQuestionTypeFilter(e.target.value)}
                  className="erp-select text-xs py-1.5"
                >
                  <option value="ALL">All Types (MCQ / MSQ / NAT)</option>
                  <option value="MCQ">MCQ Only</option>
                  <option value="MSQ">MSQ Only</option>
                  <option value="NAT">NAT Only</option>
                </select>
              </div>

              <button className="erp-btn-primary text-xs py-1.5">
                <Plus className="w-4 h-4" />
                <span>Add Question to Bank</span>
              </button>
            </div>

            <div className="space-y-3">
              {questionsList
                .filter((q) => questionTypeFilter === 'ALL' || q.type === questionTypeFilter)
                .filter((q) => q.text.toLowerCase().includes(questionSearch.toLowerCase()))
                .map((q) => (
                  <div key={q.id} className="erp-card space-y-2">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                      <div className="flex items-center space-x-2">
                        <span className="erp-badge-blue">{q.code || 'GATE'}</span>
                        <span className="erp-badge-gray">{q.type}</span>
                        <span className="erp-badge-gray">Difficulty: {q.difficulty}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-mono font-bold text-emerald-700">+{q.marks} Marks</span>
                        <button
                          onClick={async () => {
                            if (confirm('Are you sure you want to delete this question from the database?')) {
                              try {
                                await api.delete(`/admin/questions/${q.id}`);
                                fetchFacultyData();
                              } catch (e: any) {
                                alert(e.response?.data?.message || 'Failed to delete question.');
                              }
                            }
                          }}
                          className="text-red-500 hover:text-red-700 transition-colors p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-800 leading-relaxed font-medium">{q.text}</p>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* TAB 4: CANDIDATE ROSTER */}
        {activeTab === 'STUDENT_ROSTER' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Enrolled Candidates Roster ({dbStudents.length} Students)
            </h3>

            <div className="erp-table-container">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Register Number</th>
                    <th>Candidate Name</th>
                    <th>Department & Semester</th>
                    <th>Official Email</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dbStudents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        No enrolled candidates found in database.
                      </td>
                    </tr>
                  ) : (
                    dbStudents.map((s, idx) => (
                      <tr key={s.id || idx}>
                        <td className="font-mono font-bold text-[#1E40AF]">{s.registerNo || '71762105042'}</td>
                        <td className="font-semibold text-slate-900">{s.name}</td>
                        <td className="font-mono text-xs">{s.department} (Sem {s.semester || 6})</td>
                        <td className="text-slate-600">{s.email}</td>
                        <td>
                          <button
                            onClick={async () => {
                              try {
                                await api.post(`/admin/students/${s.id}/reset-attempts`, { testId });
                                alert(`Reset attempts for candidate ${s.name}`);
                              } catch (e: any) {
                                alert(e.response?.data?.message || 'Failed to reset attempts.');
                                console.error(e);
                              }
                            }}
                            className="erp-btn-secondary py-1 text-xs"
                          >
                            <RotateCcw className="w-3 h-3 mr-1" /> Reset Attempt
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

        {/* TAB 5: ATTENDANCE REGISTER */}
        {activeTab === 'ATTENDANCE' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Examination Hall Attendance Register
              </h3>
              <span className="text-xs text-slate-500">
                {examMeta?.examHall || 'Hall B-302'} • Exam Date: {examMeta?.examDate || 'N/A'}
              </span>
            </div>

            <div className="erp-table-container">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Register No</th>
                    <th>Candidate Name</th>
                    <th>Department</th>
                    <th>Check-in Time</th>
                    <th>Attendance Status</th>
                    <th>Action Toggle</th>
                  </tr>
                </thead>
                <tbody>
                  {examNotFound ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        <div className="flex flex-col items-center justify-center space-y-1">
                          <AlertCircle className="w-6 h-6 text-amber-500" />
                          <p className="font-semibold text-slate-800">Examination Not Found</p>
                          <p className="text-xs text-slate-500">
                            No attendance records exist for invalid examination ID "{testId}".
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : attendanceList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        No candidate attendance records found for examination "{testId}".
                      </td>
                    </tr>
                  ) : (
                    attendanceList.map((att, idx) => (
                      <tr key={att.registerNo || idx}>
                        <td className="font-mono font-bold text-[#1E40AF]">{att.registerNo}</td>
                        <td className="font-semibold text-slate-900">{att.name}</td>
                        <td className="font-mono text-xs">{att.department}</td>
                        <td className="font-mono text-xs">{att.checkInTime}</td>
                        <td>
                          {att.status === 'PRESENT' ? (
                            <span className="erp-badge-green">PRESENT</span>
                          ) : (
                            <span className="erp-badge-red">ABSENT</span>
                          )}
                        </td>
                        <td>
                          <button
                            onClick={() => toggleAttendanceStatus(att.registerNo)}
                            className="erp-btn-secondary py-1 text-xs"
                          >
                            Toggle Status
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

        {/* TAB 6: RESULTS & EVALUATION */}
        {activeTab === 'RESULTS' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Class Grade Distribution & Results Ledger ({dbResults.length} Items)
            </h3>

            <div className="erp-table-container">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Register Number</th>
                    <th>Candidate Name</th>
                    <th>Course Title</th>
                    <th>Score Obtained</th>
                    <th>Grade Awarded</th>
                  </tr>
                </thead>
                <tbody>
                  {dbResults.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        No evaluated test results found in database.
                      </td>
                    </tr>
                  ) : (
                    dbResults.map((row, i) => (
                      <tr key={i}>
                        <td className="font-mono font-bold text-[#1E40AF]">{row.registerNo}</td>
                        <td className="font-semibold text-slate-900">{row.studentName}</td>
                        <td className="text-slate-700">{row.courseTitle}</td>
                        <td className="font-mono font-bold text-emerald-700">{row.score} / {row.totalMarks}</td>
                        <td className="font-semibold text-slate-900">{row.grade}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 7: REPORTS & ANALYTICS */}
        {activeTab === 'REPORTS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="erp-card space-y-3">
              <h4 className="text-sm font-bold text-slate-900">Comprehensive Assessment Summary Report</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Download consolidated performance ledger including individual scores, time spent per question, and invigilation compliance logs.
              </p>
              <button
                onClick={() => handleExportReport('excel')}
                className="erp-btn-primary py-2 text-xs w-full"
              >
                <Download className="w-4 h-4" />
                <span>Download Excel Ledger Report</span>
              </button>
            </div>

            <div className="erp-card space-y-3">
              <h4 className="text-sm font-bold text-slate-900 font-sans">Official PDF Result Broadsheet</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Generate Controller of Examinations certified PDF broadsheet formatted for official departmental records.
              </p>
              <button
                onClick={() => handleExportReport('pdf')}
                className="erp-btn-secondary py-2 text-xs w-full"
              >
                <Download className="w-4 h-4 text-[#1E40AF]" />
                <span>Generate Official PDF Broadsheet</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'AI_ASSISTANT' && (
          <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-xl">
            <AIExaminationAssistant role="FACULTY" />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-3 px-6 text-center text-xs text-slate-500 mt-auto">
        Faculty Examination Governance Hub • Central University Controller of Examinations
      </footer>
    </div>
  );
}
