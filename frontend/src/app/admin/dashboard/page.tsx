'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Shield,
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
  BarChart2,
  Settings,
  Lock,
  LogOut,
  ChevronRight,
  TrendingUp,
  Eye,
} from 'lucide-react';
import api from '@/lib/api';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, PieChart, Pie, Cell } from 'recharts';

export default function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    'OVERVIEW' | 'STUDENTS' | 'FACULTY' | 'QUESTIONS' | 'EXAMS' | 'ANALYTICS' | 'IMPORTS' | 'SECURITY' | 'SETTINGS'
  >('OVERVIEW');

  // Overview Data
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState('');

  // Student Management State
  const [students, setStudents] = useState<any[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [newStudent, setNewStudent] = useState({
    registerNo: '',
    name: '',
    email: '',
    department: 'CSE',
    year: '3',
    semester: '6',
    section: 'A',
  });

  // Faculty Management State
  const [faculty, setFaculty] = useState<any[]>([]);
  const [isAddFacultyOpen, setIsAddFacultyOpen] = useState(false);
  const [newFaculty, setNewFaculty] = useState({ name: '', email: '', department: 'CSE' });

  // Question Bank State
  const [questions, setQuestions] = useState<any[]>([]);
  const [questionTypeFilter, setQuestionTypeFilter] = useState('ALL');
  const [isAddQuestionOpen, setIsAddQuestionOpen] = useState(false);
  const [newQuestion, setNewQuestion] = useState({
    text: '',
    type: 'MCQ',
    difficulty: 'MEDIUM',
    marks: '1.0',
    negativeMarks: '0.33',
    explanation: '',
  });

  // Exam Management State
  const [exams, setExams] = useState<any[]>([]);
  const [isAddExamOpen, setIsAddExamOpen] = useState(false);
  const [newExam, setNewExam] = useState({
    title: '',
    description: '',
    examType: 'SCHEDULED',
    durationMinutes: '180',
    totalMarks: '100',
    targetDepartment: 'CSE',
    maxViolations: '5',
  });

  // Imports & Settings
  const [questionFile, setQuestionFile] = useState<File | null>(null);
  const [studentFile, setStudentFile] = useState<File | null>(null);
  const [allowedDomains, setAllowedDomains] = useState('cit.edu.in');

  useEffect(() => {
    fetchInitialData();
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4000);
  };

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [overviewRes, studentsRes, facultyRes, questionsRes, examsRes] = await Promise.all([
        api.get('/admin/overview'),
        api.get('/admin/students'),
        api.get('/admin/faculty'),
        api.get('/admin/questions'),
        api.get('/admin/exams'),
      ]);

      if (overviewRes.data?.success) setOverview(overviewRes.data.data);
      if (studentsRes.data?.success) setStudents(studentsRes.data.data);
      if (facultyRes.data?.success) setFaculty(facultyRes.data.data);
      if (questionsRes.data?.success) setQuestions(questionsRes.data.data);
      if (examsRes.data?.success) setExams(examsRes.data.data);
    } catch (err: any) {
      console.error('Error fetching admin dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Student Handlers
  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/students', newStudent);
      if (res.data.success) {
        showToast('✅ Student added successfully!');
        setIsAddStudentOpen(false);
        setNewStudent({ registerNo: '', name: '', email: '', department: 'CSE', year: '3', semester: '6', section: 'A' });
        fetchInitialData();
      }
    } catch (err: any) {
      showToast(`❌ ${err.response?.data?.message || 'Failed to add student'}`);
    }
  };

  const handleDeleteStudent = async (id: string) => {
    if (!confirm('Are you sure you want to remove this student record?')) return;
    try {
      await api.delete(`/admin/students/${id}`);
      showToast('✅ Student record removed');
      fetchInitialData();
    } catch (err: any) {
      showToast('❌ Failed to delete student');
    }
  };

  const handleResetAttempts = async (id: string) => {
    if (!confirm('Reset exam attempts for this student?')) return;
    try {
      await api.post(`/admin/students/${id}/reset-attempts`);
      showToast('✅ Student attempts reset successfully');
    } catch (err: any) {
      showToast('❌ Failed to reset attempts');
    }
  };

  // Faculty Handlers
  const handleAddFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/faculty', newFaculty);
      if (res.data.success) {
        showToast('✅ Faculty member added!');
        setIsAddFacultyOpen(false);
        setNewFaculty({ name: '', email: '', department: 'CSE' });
        fetchInitialData();
      }
    } catch (err: any) {
      showToast(`❌ ${err.response?.data?.message || 'Failed to add faculty'}`);
    }
  };

  const handleDeleteFaculty = async (id: string) => {
    if (!confirm('Are you sure you want to remove this faculty member?')) return;
    try {
      await api.delete(`/admin/faculty/${id}`);
      showToast('✅ Faculty member removed');
      fetchInitialData();
    } catch (err: any) {
      showToast('❌ Failed to delete faculty');
    }
  };

  // Question Handlers
  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/questions', newQuestion);
      if (res.data.success) {
        showToast('✅ Question created successfully!');
        setIsAddQuestionOpen(false);
        setNewQuestion({ text: '', type: 'MCQ', difficulty: 'MEDIUM', marks: '1.0', negativeMarks: '0.33', explanation: '' });
        fetchInitialData();
      }
    } catch (err: any) {
      showToast('❌ Failed to create question');
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!confirm('Delete this question from Question Bank?')) return;
    try {
      await api.delete(`/admin/questions/${id}`);
      showToast('✅ Question deleted');
      fetchInitialData();
    } catch (err: any) {
      showToast('❌ Failed to delete question');
    }
  };

  // Exam Handlers
  const handleAddExam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/exams', newExam);
      if (res.data.success) {
        showToast('✅ Mock exam scheduled & published!');
        setIsAddExamOpen(false);
        fetchInitialData();
      }
    } catch (err: any) {
      showToast('❌ Failed to create exam');
    }
  };

  const handleTogglePublish = async (id: string) => {
    try {
      const res = await api.put(`/admin/exams/${id}/publish`);
      showToast(`✅ ${res.data.message}`);
      fetchInitialData();
    } catch (err: any) {
      showToast('❌ Failed to toggle publish status');
    }
  };

  const handleDeleteExam = async (id: string) => {
    if (!confirm('Delete this mock exam?')) return;
    try {
      await api.delete(`/admin/exams/${id}`);
      showToast('✅ Exam deleted');
      fetchInitialData();
    } catch (err: any) {
      showToast('❌ Failed to delete exam');
    }
  };

  // File Upload Handlers
  const handleQuestionUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionFile) return;

    try {
      const formData = new FormData();
      formData.append('file', questionFile);
      const res = await api.post('/admin/upload-questions', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data.success) {
        showToast(`✅ ${res.data.message}`);
        setQuestionFile(null);
        fetchInitialData();
      }
    } catch (err: any) {
      showToast(`❌ ${err.response?.data?.message || 'Question upload failed'}`);
    }
  };

  const handleStudentUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentFile) return;

    try {
      const formData = new FormData();
      formData.append('file', studentFile);
      const res = await api.post('/admin/upload-students', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data.success) {
        showToast(`✅ ${res.data.message}`);
        setStudentFile(null);
        fetchInitialData();
      }
    } catch (err: any) {
      showToast(`❌ ${err.response?.data?.message || 'Student import failed'}`);
    }
  };

  // Filtered Lists
  const filteredStudents = students.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.email.toLowerCase().includes(studentSearch.toLowerCase()) ||
      (s.registerNo && s.registerNo.toLowerCase().includes(studentSearch.toLowerCase()));
    const matchesDept = deptFilter === 'ALL' || s.department === deptFilter;
    return matchesSearch && matchesDept;
  });

  const filteredQuestions = questions.filter((q) => questionTypeFilter === 'ALL' || q.type === questionTypeFilter);

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mr-3" />
        Loading GSMAS Administration Portal...
      </div>
    );
  }

  const metrics = overview?.metrics || {
    totalStudents: students.length,
    totalFaculty: faculty.length,
    totalDepartments: 5,
    totalExams: exams.length,
    activeExams: exams.filter((e) => e.isPublished).length,
    completedExams: 12,
    totalQuestions: questions.length,
    activeSessions: 0,
    databaseStatus: 'CONNECTED',
    socketStatus: 'ACTIVE',
    serverHealth: 'HEALTHY',
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none-security">
      {/* Toast Notification Banner */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 border border-indigo-500/40 text-slate-100 px-5 py-3 rounded-2xl shadow-2xl flex items-center space-x-2 text-xs font-semibold animate-pulse">
          <CheckCircle className="w-4 h-4 text-indigo-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Navbar */}
      <header className="glass-panel border-b border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">GSMAS Institutional Portal</h1>
            <p className="text-xs text-slate-400">Chennai Institute of Technology • GATE System Governance</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>DB: {metrics.databaseStatus}</span>
          </div>

          <button
            onClick={() => {
              localStorage.clear();
              router.push('/');
            }}
            className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-800 transition-all"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Multi-Tab Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar Navigation */}
        <aside className="w-64 bg-slate-900/60 border-r border-slate-800 p-4 space-y-1.5 flex flex-col shrink-0">
          {[
            { id: 'OVERVIEW', label: 'Dashboard Overview', icon: BarChart2 },
            { id: 'STUDENTS', label: 'Student Roster', icon: Users, badge: students.length },
            { id: 'FACULTY', label: 'Faculty Directory', icon: UserCheck, badge: faculty.length },
            { id: 'QUESTIONS', label: 'Question Bank', icon: BookOpen, badge: questions.length },
            { id: 'EXAMS', label: 'Exam Scheduler', icon: Clock, badge: exams.length },
            { id: 'ANALYTICS', label: 'Analytics & Charts', icon: TrendingUp },
            { id: 'IMPORTS', label: 'Bulk Imports & Exports', icon: FileSpreadsheet },
            { id: 'SECURITY', label: 'Security & Domain', icon: Lock },
            { id: 'SETTINGS', label: 'System Settings', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </div>
                {tab.badge !== undefined && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                      isActive ? 'bg-purple-700 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-6 overflow-y-auto space-y-6 bg-slate-950">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-6">
              {/* Metrics Grid */}
              <div className="grid grid-cols-4 gap-4">
                <div className="glass-panel p-5 rounded-2xl border border-slate-800">
                  <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">Total Students</div>
                  <div className="text-3xl font-bold text-white">{metrics.totalStudents}</div>
                  <p className="text-[11px] text-slate-500 mt-1">Active registered student accounts</p>
                </div>

                <div className="glass-panel p-5 rounded-2xl border border-slate-800">
                  <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">Faculty Members</div>
                  <div className="text-3xl font-bold text-white">{metrics.totalFaculty}</div>
                  <p className="text-[11px] text-slate-500 mt-1">Invigilators & subject experts</p>
                </div>

                <div className="glass-panel p-5 rounded-2xl border border-slate-800">
                  <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">Question Bank</div>
                  <div className="text-3xl font-bold text-indigo-400">{metrics.totalQuestions}</div>
                  <p className="text-[11px] text-slate-500 mt-1">GATE standard MCQs/MSQs/NATs</p>
                </div>

                <div className="glass-panel p-5 rounded-2xl border border-slate-800">
                  <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">Published Exams</div>
                  <div className="text-3xl font-bold text-emerald-400">{metrics.activeExams}</div>
                  <p className="text-[11px] text-slate-500 mt-1">Live active test papers</p>
                </div>
              </div>

              {/* Department Distribution & Visual Chart */}
              <div className="grid grid-cols-2 gap-6">
                <div className="glass-panel p-6 rounded-2xl border border-slate-800">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Department Student Enrollment</h3>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={overview?.departmentBreakdown || [{ department: 'CSE', count: students.length }]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="department" stroke="#94a3b8" fontSize={11} />
                        <YAxis stroke="#94a3b8" fontSize={11} />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }} />
                        <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">System Governance Status</h3>
                  <div className="space-y-3 text-xs">
                    <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex justify-between items-center">
                      <span className="text-slate-400">OAuth Domain Enforcement</span>
                      <span className="font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                        {overview?.security?.allowedDomains || 'cit.edu.in'}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex justify-between items-center">
                      <span className="text-slate-400">JWT Token Security Secret</span>
                      <span className="font-mono font-bold text-indigo-400">Active (12 Hours)</span>
                    </div>

                    <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex justify-between items-center">
                      <span className="text-slate-400">Max Violations Threshold</span>
                      <span className="font-mono font-bold text-rose-400">5 Infractions</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: STUDENT ROSTER */}
          {activeTab === 'STUDENTS' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <div className="relative w-64">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                    <input
                      type="text"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder="Search Reg No or Name..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <select
                    value={deptFilter}
                    onChange={(e) => setDeptFilter(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-purple-500"
                  >
                    <option value="ALL">All Departments</option>
                    <option value="CSE">CSE</option>
                    <option value="ECE">ECE</option>
                    <option value="IT">IT</option>
                    <option value="EEE">EEE</option>
                    <option value="MECH">MECH</option>
                  </select>
                </div>

                <button
                  onClick={() => setIsAddStudentOpen(true)}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl flex items-center space-x-1.5 shadow-lg shadow-purple-600/30"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Student</span>
                </button>
              </div>

              <div className="glass-panel rounded-2xl overflow-hidden border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3.5 px-4">Register No</th>
                      <th className="py-3.5 px-4">Student Name</th>
                      <th className="py-3.5 px-4">College Email</th>
                      <th className="py-3.5 px-4">Dept & Year</th>
                      <th className="py-3.5 px-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          No student records matching filters.
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-900/40">
                          <td className="py-3 px-4 font-mono font-bold text-indigo-400">{s.registerNo || 'N/A'}</td>
                          <td className="py-3 px-4 font-bold text-white">{s.name}</td>
                          <td className="py-3 px-4 text-slate-400">{s.email}</td>
                          <td className="py-3 px-4 font-mono text-slate-300">
                            {s.department} (Yr {s.year || 3})
                          </td>
                          <td className="py-3 px-4 space-x-2">
                            <button
                              onClick={() => handleResetAttempts(s.id)}
                              className="px-2.5 py-1 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20"
                            >
                              Reset Attempts
                            </button>
                            <button
                              onClick={() => handleDeleteStudent(s.id)}
                              className="px-2.5 py-1 rounded bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20"
                            >
                              Delete
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

          {/* TAB 3: FACULTY DIRECTORY */}
          {activeTab === 'FACULTY' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Faculty Directory</h2>
                <button
                  onClick={() => setIsAddFacultyOpen(true)}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl flex items-center space-x-1.5 shadow-lg shadow-purple-600/30"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Faculty Member</span>
                </button>
              </div>

              <div className="glass-panel rounded-2xl overflow-hidden border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3.5 px-4">Faculty Name</th>
                      <th className="py-3.5 px-4">College Email</th>
                      <th className="py-3.5 px-4">Department</th>
                      <th className="py-3.5 px-4">Created Tests</th>
                      <th className="py-3.5 px-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {faculty.map((f) => (
                      <tr key={f.id} className="hover:bg-slate-900/40">
                        <td className="py-3 px-4 font-bold text-white">{f.name}</td>
                        <td className="py-3 px-4 text-slate-400">{f.email}</td>
                        <td className="py-3 px-4 font-mono text-purple-400">{f.department}</td>
                        <td className="py-3 px-4 font-bold text-emerald-400">{f._count?.createdTests || 0}</td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => handleDeleteFaculty(f.id)}
                            className="px-2.5 py-1 rounded bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: QUESTION BANK */}
          {activeTab === 'QUESTIONS' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <select
                    value={questionTypeFilter}
                    onChange={(e) => setQuestionTypeFilter(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-purple-500"
                  >
                    <option value="ALL">All Types (MCQ / MSQ / NAT)</option>
                    <option value="MCQ">MCQ Only</option>
                    <option value="MSQ">MSQ Only</option>
                    <option value="NAT">NAT Only</option>
                  </select>
                </div>

                <button
                  onClick={() => setIsAddQuestionOpen(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center space-x-1.5 shadow-lg shadow-indigo-600/30"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Question</span>
                </button>
              </div>

              <div className="space-y-4">
                {filteredQuestions.map((q) => (
                  <div key={q.id} className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3">
                    <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                      <div className="flex items-center space-x-2">
                        <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          {q.type}
                        </span>
                        <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-slate-300">
                          {q.difficulty}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          {q.subtopic?.topic?.module?.subject?.name || 'Computer Science'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className="text-xs font-mono text-emerald-400">+{q.marks} Marks</span>
                        <button onClick={() => handleDeleteQuestion(q.id)} className="text-rose-400 hover:text-rose-300">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed font-sans">{q.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: EXAM SCHEDULER */}
          {activeTab === 'EXAMS' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Scheduled Mock Exams</h2>
                <button
                  onClick={() => setIsAddExamOpen(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center space-x-1.5 shadow-lg shadow-emerald-600/30"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Mock Exam</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {exams.map((e) => (
                  <div key={e.id} className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          {e.examType}
                        </span>
                        <h3 className="text-base font-bold text-white mt-2">{e.title}</h3>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{e.description}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-emerald-400">{e.totalMarks} Marks</div>
                        <div className="text-xs text-slate-500">{e.durationMinutes} Mins</div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                      <button
                        onClick={() => handleTogglePublish(e.id)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                          e.isPublished
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}
                      >
                        {e.isPublished ? '● Published' : '○ Draft Mode'}
                      </button>

                      <button onClick={() => handleDeleteExam(e.id)} className="text-rose-400 hover:text-rose-300 text-xs font-bold">
                        Delete Exam
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: ANALYTICS & CHARTS */}
          {activeTab === 'ANALYTICS' && (
            <div className="space-y-6">
              <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Institutional Performance Analytics</h2>
              <div className="grid grid-cols-2 gap-6">
                <div className="glass-panel p-6 rounded-2xl border border-slate-800">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Department Enrollment</h3>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={overview?.departmentBreakdown || [{ department: 'CSE', count: students.length }]}
                          dataKey="count"
                          nameKey="department"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                        >
                          {(overview?.departmentBreakdown || []).map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: IMPORTS & EXPORTS */}
          {activeTab === 'IMPORTS' && (
            <div className="grid grid-cols-2 gap-6">
              {/* Question Import */}
              <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
                <div className="flex items-center space-x-3 text-indigo-400">
                  <FileSpreadsheet className="w-6 h-6" />
                  <h2 className="text-base font-bold text-white">Question Bank Bulk Import</h2>
                </div>
                <p className="text-xs text-slate-400">Import questions via Excel (.xlsx), CSV, or JSON formatted files.</p>

                <form onSubmit={handleQuestionUpload} className="space-y-4 pt-2">
                  <input
                    type="file"
                    accept=".xlsx,.csv,.json"
                    onChange={(e) => setQuestionFile(e.target.files?.[0] || null)}
                    className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={!questionFile}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30"
                  >
                    Upload Question Bank
                  </button>
                </form>
              </div>

              {/* Student Roster Import */}
              <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
                <div className="flex items-center space-x-3 text-emerald-400">
                  <Users className="w-6 h-6" />
                  <h2 className="text-base font-bold text-white">Student Roster Batch Import</h2>
                </div>
                <p className="text-xs text-slate-400">Import student register numbers and departments from Excel files.</p>

                <form onSubmit={handleStudentUpload} className="space-y-4 pt-2">
                  <input
                    type="file"
                    accept=".xlsx,.csv"
                    onChange={(e) => setStudentFile(e.target.files?.[0] || null)}
                    className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={!studentFile}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/30"
                  >
                    Import Student Roster
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 8: SECURITY & DOMAIN */}
          {activeTab === 'SECURITY' && (
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4 max-w-xl">
              <h2 className="text-base font-bold text-white flex items-center">
                <Lock className="w-5 h-5 text-purple-400 mr-2" />
                Security & OAuth Domain Governance
              </h2>
              <p className="text-xs text-slate-400">
                Single-point domain whitelist configuration. Controls which college email domains can sign in via Google OAuth.
              </p>
              <div className="space-y-2 pt-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Authorized Domain (Default: cit.edu.in)
                </label>
                <input
                  type="text"
                  value={allowedDomains}
                  onChange={(e) => setAllowedDomains(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 font-mono focus:outline-none focus:border-purple-500"
                />
                <button
                  onClick={async () => {
                    await api.put('/admin/settings', { key: 'ALLOWED_EMAIL_DOMAINS', value: allowedDomains });
                    showToast('✅ Allowed domain updated!');
                  }}
                  className="mt-3 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-600/30"
                >
                  Save Security Domain Config
                </button>
              </div>
            </div>
          )}

          {/* TAB 9: SETTINGS */}
          {activeTab === 'SETTINGS' && (
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4 max-w-xl">
              <h2 className="text-base font-bold text-white flex items-center">
                <Settings className="w-5 h-5 text-indigo-400 mr-2" />
                System Configuration Settings
              </h2>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">College Institution Name</label>
                  <input
                    type="text"
                    defaultValue="Chennai Institute of Technology"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Max Violations Auto-Submit Threshold</label>
                  <input
                    type="number"
                    defaultValue={5}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-slate-200 font-mono"
                  />
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Add Student Modal */}
      {isAddStudentOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel p-6 rounded-2xl max-w-md w-full border border-purple-500/30 space-y-4">
            <h3 className="text-base font-bold text-white">Add New Student Record</h3>
            <form onSubmit={handleAddStudent} className="space-y-3 text-xs">
              <input
                type="text"
                placeholder="Register Number (e.g. 71762105001)"
                value={newStudent.registerNo}
                onChange={(e) => setNewStudent({ ...newStudent, registerNo: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-slate-200 font-mono"
              />
              <input
                type="text"
                placeholder="Student Full Name"
                value={newStudent.name}
                onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-slate-200"
              />
              <input
                type="email"
                placeholder="College Email (e.g. ganesh@cit.edu.in)"
                value={newStudent.email}
                onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-slate-200"
              />
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddStudentOpen(false)}
                  className="px-4 py-2 bg-slate-800 rounded-xl text-slate-300"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-purple-600 text-white font-bold rounded-xl shadow-lg shadow-purple-600/30">
                  Save Student
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Faculty Modal */}
      {isAddFacultyOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel p-6 rounded-2xl max-w-md w-full border border-purple-500/30 space-y-4">
            <h3 className="text-base font-bold text-white">Add New Faculty Member</h3>
            <form onSubmit={handleAddFaculty} className="space-y-3 text-xs">
              <input
                type="text"
                placeholder="Faculty Name (e.g. Dr. A. R. Sharma)"
                value={newFaculty.name}
                onChange={(e) => setNewFaculty({ ...newFaculty, name: e.target.value })}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-slate-200"
              />
              <input
                type="email"
                placeholder="Faculty Email (e.g. faculty@cit.edu.in)"
                value={newFaculty.email}
                onChange={(e) => setNewFaculty({ ...newFaculty, email: e.target.value })}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-slate-200"
              />
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddFacultyOpen(false)}
                  className="px-4 py-2 bg-slate-800 rounded-xl text-slate-300"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-purple-600 text-white font-bold rounded-xl shadow-lg shadow-purple-600/30">
                  Save Faculty Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Question Modal */}
      {isAddQuestionOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel p-6 rounded-2xl max-w-lg w-full border border-indigo-500/30 space-y-4">
            <h3 className="text-base font-bold text-white">Create Question Bank Entry</h3>
            <form onSubmit={handleAddQuestion} className="space-y-3 text-xs">
              <textarea
                placeholder="Question Statement..."
                value={newQuestion.text}
                onChange={(e) => setNewQuestion({ ...newQuestion, text: e.target.value })}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-slate-200 h-24"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={newQuestion.type}
                  onChange={(e) => setNewQuestion({ ...newQuestion, type: e.target.value })}
                  className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-slate-200"
                >
                  <option value="MCQ">MCQ (Multiple Choice)</option>
                  <option value="MSQ">MSQ (Multiple Select)</option>
                  <option value="NAT">NAT (Numerical Answer)</option>
                </select>

                <select
                  value={newQuestion.difficulty}
                  onChange={(e) => setNewQuestion({ ...newQuestion, difficulty: e.target.value })}
                  className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-slate-200"
                >
                  <option value="EASY">EASY</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HARD">HARD</option>
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddQuestionOpen(false)}
                  className="px-4 py-2 bg-slate-800 rounded-xl text-slate-300"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30">
                  Save Question
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Exam Modal */}
      {isAddExamOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel p-6 rounded-2xl max-w-lg w-full border border-emerald-500/30 space-y-4">
            <h3 className="text-base font-bold text-white">Create & Schedule Mock Exam</h3>
            <form onSubmit={handleAddExam} className="space-y-3 text-xs">
              <input
                type="text"
                placeholder="Exam Title (e.g. GATE CS All-India Mock Test 02)"
                value={newExam.title}
                onChange={(e) => setNewExam({ ...newExam, title: e.target.value })}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-slate-200"
              />
              <textarea
                placeholder="Exam Instructions & Description..."
                value={newExam.description}
                onChange={(e) => setNewExam({ ...newExam, description: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-slate-200 h-20"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  placeholder="Duration (Mins)"
                  value={newExam.durationMinutes}
                  onChange={(e) => setNewExam({ ...newExam, durationMinutes: e.target.value })}
                  className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-slate-200"
                />
                <input
                  type="number"
                  placeholder="Total Marks"
                  value={newExam.totalMarks}
                  onChange={(e) => setNewExam({ ...newExam, totalMarks: e.target.value })}
                  className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-slate-200"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddExamOpen(false)}
                  className="px-4 py-2 bg-slate-800 rounded-xl text-slate-300"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/30">
                  Publish Exam
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
