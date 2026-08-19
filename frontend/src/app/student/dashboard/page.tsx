'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  GraduationCap,
  Play,
  Award,
  BarChart3,
  LogOut,
  Calendar,
  FileText,
  Bell,
  AlertCircle,
  Search,
  BookOpen,
  CheckCircle2,
} from 'lucide-react';
import api from '@/lib/api';
import { StudentAnalyticsView } from '@/components/analytics/StudentAnalyticsView';

// Strict Helper for profile text fields (uses "N/A" for missing text fields)
function displayProfileField<T>(value: T | null | undefined, fallback = 'N/A'): string {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

export default function StudentDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [tests, setTests] = useState<any[]>([]);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<
    'OVERVIEW' | 'UPCOMING' | 'RESULTS' | 'ATTENDANCE' | 'ANALYTICS' | 'NOTIFICATIONS' | 'HISTORY'
  >('OVERVIEW');
  const [loading, setLoading] = useState(true);

  // Search & Filter State for History
  const [historySearch, setHistorySearch] = useState('');

  // Live Clock State & Reactive Background Polling
  const [currentDateTime, setCurrentDateTime] = useState<string>('');

  useEffect(() => {
    const savedUser = localStorage.getItem('gsmas_user');
    const token = localStorage.getItem('gsmas_token');

    if (!savedUser || !token) {
      router.push('/');
      return;
    }

    try {
      setUser(JSON.parse(savedUser));
    } catch (e) {
      localStorage.clear();
      router.push('/');
      return;
    }

    fetchDashboardData();
  }, []);

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

    fetchDashboardData();
    // Reactive background polling every 15s to keep timetable and analytics updated without page reload
    const pollInterval = setInterval(() => {
      fetchDashboardData(true);
    }, 15000);

    return () => {
      clearInterval(clockInterval);
      clearInterval(pollInterval);
    };
  }, []);

  const [dbNotifications, setDbNotifications] = useState<any[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchDashboardData = async (silent: boolean = false) => {
    if (!silent) setLoading(true);
    setFetchError(null);
    try {
      const [profileRes, testRes, analyticsRes, notifRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/exam/student-tests'),
        api.get('/analytics/student-me'),
        api.get('/notifications'),
      ]);

      if (profileRes.data?.success && profileRes.data?.data) {
        setUser(profileRes.data.data);
      }
      if (testRes.data?.success) setTests(testRes.data.data || []);
      if (analyticsRes.data?.success) setAnalyticsData(analyticsRes.data.data);
      if (notifRes.data?.success) setDbNotifications(notifRes.data.data.notifications || []);
    } catch (err: any) {
      console.error('Error fetching student dashboard:', err);
      setFetchError(err.response?.data?.message || 'Failed to load examination portal data.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push('/');
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center text-slate-600 space-y-3">
        <div className="w-8 h-8 border-3 border-[#1E40AF] border-t-transparent rounded-full animate-spin" />
        <div className="text-sm font-medium">Loading Student Examination Portal...</div>
      </div>
    );
  }

  // Dynamic Datasets derived strictly from student assignment status
  const completedExams = tests.filter(
    (assignment) => assignment.status === 'COMPLETED' || assignment.status === 'AUTO_SUBMITTED'
  );

  const upcomingExams = tests.filter(
    (assignment) => assignment.status === 'SCHEDULED' || assignment.status === 'IN_PROGRESS'
  );

  const studentProfile = {
    name: displayProfileField(user.name, 'N/A'),
    registerNo: displayProfileField(user.registerNo, 'N/A'),
    department: displayProfileField(user.department, 'N/A'),
    degree: user.department ? `B.E. ${user.department}` : 'N/A',
    semester: user.semester ? `Semester ${user.semester}` : 'N/A',
    section: user.section ? `Section ${user.section}` : 'N/A',
    batch: user.year ? `Year ${user.year}` : 'N/A',
    advisor: 'N/A',
    attendancePercent: '--',
    cgpa: '--',
  };

  const upcomingExamsList = upcomingExams.map((item: any) => {
    const startTimeDate = item.test?.startTime ? new Date(item.test.startTime) : null;
    const formattedDate = startTimeDate
      ? startTimeDate.toISOString().split('T')[0]
      : '--';
    const formattedTime = startTimeDate
      ? startTimeDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
      : '--';

    const titleStr = item.test?.title || '--';
    const titleParts = titleStr !== '--' ? titleStr.split(' ') : [];
    const courseCode = titleParts[0] && /^[A-Z0-9]+$/i.test(titleParts[0]) ? titleParts[0] : '--';
    const duration = item.test?.durationMinutes !== undefined && item.test?.durationMinutes !== null ? item.test.durationMinutes : '--';

    return {
      id: item.test?.id || item.id,
      code: courseCode,
      title: titleStr,
      date: formattedDate,
      time: startTimeDate ? `${formattedTime} (${duration} Mins)` : '--',
      hall: item.test?.targetSection ? `Exam Hall (${item.test.targetSection})` : 'Online CBT Portal',
      duration: `${duration} Mins`,
      status: item.status || '--',
    };
  });

  const recentResultsList = completedExams.map((item: any) => {
    const titleStr = item.test?.title || '--';
    const code = titleStr !== '--' && titleStr.split(' ')[0] && /^[A-Z0-9]+$/i.test(titleStr.split(' ')[0]) ? titleStr.split(' ')[0] : '--';
    const score = item.score !== null && item.score !== undefined ? item.score : '--';
    const totalMarks = item.test?.totalMarks !== null && item.test?.totalMarks !== undefined ? item.test.totalMarks : '--';

    return {
      code,
      subject: titleStr,
      score,
      totalMarks,
      status: item.status || 'EVALUATED',
    };
  });

  const attendanceBreakdown: any[] = [];

  const notificationsList = dbNotifications.map((n: any) => ({
    id: n.id,
    title: n.title,
    date: new Date(n.createdAt).toISOString().split('T')[0],
    author: n.role ? `Target: ${n.role}` : 'System',
    badge: (n.type || 'INFO').toUpperCase(),
    content: n.message,
  }));

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="bg-[#1E40AF] text-white border-b border-blue-900 px-6 py-3.5 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white/10 rounded-md border border-white/20">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white">Central University Examination Portal</h1>
              <p className="text-xs text-blue-200">Student Academic Dashboard & Assessment Portal</p>
            </div>
          </div>

          <div className="flex items-center space-x-5">
            <div className="text-right hidden md:block border-r border-blue-800 pr-4">
              <span className="text-xs font-mono text-blue-100 block">{currentDateTime || 'Loading time...'}</span>
            </div>
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-white">{studentProfile.name}</div>
              <div className="text-[11px] text-blue-200 font-mono">
                Reg: {studentProfile.registerNo} • {studentProfile.semester}
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Sign Out"
              className="p-2 rounded-md bg-blue-900/60 hover:bg-blue-900 text-blue-200 hover:text-white transition-colors border border-blue-700"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Page Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Student Profile Card Header */}
        <div className="erp-card flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border-l-4 border-l-[#1E40AF]">
          <div className="flex items-start space-x-4">
            <div className="w-12 h-12 rounded-md bg-blue-50 text-[#1E40AF] flex items-center justify-center font-bold text-lg border border-blue-200 shrink-0">
              {studentProfile.name !== 'N/A' ? studentProfile.name.charAt(0) : 'U'}
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">{studentProfile.name}</h2>
                <span className="erp-badge-blue font-mono">Reg: {studentProfile.registerNo}</span>
                <span className="erp-badge-gray">{studentProfile.semester}</span>
              </div>
              <p className="text-xs text-slate-600 font-medium">{studentProfile.department}</p>
              <div className="flex flex-wrap gap-4 text-xs text-slate-500 pt-1">
                <span>Degree: <b>{studentProfile.degree}</b></span>
                <span>Section: <b>{studentProfile.section}</b></span>
                <span>Faculty Advisor: <b>{studentProfile.advisor}</b></span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4 border-t md:border-t-0 md:border-l border-slate-200 pt-3 md:pt-0 md:pl-6 text-xs">
            <div className="text-center px-2">
              <span className="text-slate-500 block uppercase text-[10px] font-semibold">Attendance</span>
              <span className="text-lg font-bold text-slate-700">{studentProfile.attendancePercent}</span>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div className="text-center px-2">
              <span className="text-slate-500 block uppercase text-[10px] font-semibold">Current CGPA</span>
              <span className="text-lg font-bold text-[#1E40AF]">{studentProfile.cgpa}</span>
            </div>
          </div>
        </div>

        {/* Dashboard Navigation Tabs */}
        <div className="flex overflow-x-auto border-b border-slate-200 space-x-1 pb-1">
          {[
            { id: 'OVERVIEW', label: 'Overview & Ongoing', icon: BookOpen },
            { id: 'UPCOMING', label: 'Upcoming Timetable', icon: Calendar },
            { id: 'RESULTS', label: 'Semester Results', icon: Award },
            { id: 'ATTENDANCE', label: 'Attendance Summary', icon: CheckCircle2 },
            { id: 'ANALYTICS', label: 'Performance Analytics', icon: BarChart3 },
            { id: 'NOTIFICATIONS', label: 'Circulars & Alerts', icon: Bell, badge: notificationsList.length },
            { id: 'HISTORY', label: 'Completed Exams', icon: FileText, badge: completedExams.length },
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

        {/* TAB 1: OVERVIEW & ONGOING EXAM */}
        {activeTab === 'OVERVIEW' && (
          <div className="space-y-6">
            {/* Active / Ongoing CBT Exam Banner */}
            <div>
              <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">
                Assigned CBT Examinations
              </h3>
              {tests.length === 0 ? (
                <div className="erp-card text-center py-10 text-slate-500 text-xs font-mono">
                  No data available
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {tests.map((assignment: any) => {
                    const status = assignment.status || 'SCHEDULED';
                    const isCompleted = status === 'COMPLETED' || status === 'AUTO_SUBMITTED';
                    const isInProgress = status === 'IN_PROGRESS';

                    const testTitle = assignment.test?.title || '--';
                    const testDesc = assignment.test?.description || '';
                    const examCategory = assignment.test?.examType || '--';
                    const totalMarksStr = assignment.test?.totalMarks !== undefined && assignment.test?.totalMarks !== null ? `${assignment.test.totalMarks} Marks` : '--';
                    const durationStr = assignment.test?.durationMinutes !== undefined && assignment.test?.durationMinutes !== null ? `${assignment.test.durationMinutes} Minutes` : '--';
                    const maxViolationsStr = assignment.test?.maxViolations !== undefined && assignment.test?.maxViolations !== null ? assignment.test.maxViolations : '--';

                    return (
                      <div
                        key={assignment.id}
                        className="erp-card flex flex-col justify-between border-slate-200 hover:border-blue-300 space-y-4"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center space-x-2 mb-1">
                              <span className={isCompleted ? 'erp-badge-green' : isInProgress ? 'erp-badge-amber' : 'erp-badge-blue'}>
                                {status}
                              </span>
                              <span className="erp-badge-gray">{examCategory}</span>
                            </div>
                            <h4 className="text-base font-bold text-slate-900 mt-1">{testTitle}</h4>
                            {testDesc && <p className="text-xs text-slate-600 line-clamp-2 mt-1">{testDesc}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-bold text-emerald-700">{totalMarksStr}</div>
                            <div className="text-xs text-slate-500 font-mono">{durationStr}</div>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                          <div className="text-xs text-slate-500 font-mono">
                            Max Security Violations: <b>{maxViolationsStr}</b>
                          </div>

                          {isCompleted ? (
                            <div className="flex items-center space-x-2">
                              <span className="erp-badge-green">
                                Score: {assignment.score !== null && assignment.score !== undefined ? assignment.score : '--'}/{assignment.test?.totalMarks !== null && assignment.test?.totalMarks !== undefined ? assignment.test.totalMarks : '--'}
                              </span>
                              <button
                                onClick={() => router.push(`/student/solution/${assignment.id}`)}
                                className="erp-btn-secondary py-1.5 text-xs"
                              >
                                Review Solutions
                              </button>
                            </div>
                          ) : isInProgress ? (
                            <button
                              onClick={() => router.push(`/student/exam/${assignment.test?.id || assignment.testId}`)}
                              className="erp-btn-primary py-2 text-xs font-semibold"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>Resume CBT Exam</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => router.push(`/student/exam/${assignment.test?.id || assignment.testId}`)}
                              className="erp-btn-primary py-2 text-xs font-semibold"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>Launch CBT Exam</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Overview Quick Glance Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="erp-card">
                <div className="flex items-center justify-between text-slate-600 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Attendance Status</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-bold text-slate-900">{studentProfile.attendancePercent}</div>
                <p className="text-xs text-slate-500 mt-1">Status: No data available</p>
              </div>

              <div className="erp-card">
                <div className="flex items-center justify-between text-slate-600 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Completed Assessments</span>
                  <Award className="w-4 h-4 text-[#1E40AF]" />
                </div>
                <div className="text-2xl font-bold text-slate-900">{completedExams.length}</div>
                <p className="text-xs text-slate-500 mt-1">Evaluated by Controller of Examinations</p>
              </div>

              <div className="erp-card">
                <div className="flex items-center justify-between text-slate-600 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Upcoming Exams</span>
                  <Calendar className="w-4 h-4 text-amber-600" />
                </div>
                <div className="text-2xl font-bold text-slate-900">{upcomingExams.length}</div>
                <p className="text-xs text-slate-500 mt-1">Scheduled Assessments</p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: UPCOMING TIMETABLE */}
        {activeTab === 'UPCOMING' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Examination Timetable
              </h3>
              <span className="text-xs text-slate-500">Official Schedule</span>
            </div>

            {fetchError && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-3 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{fetchError}</span>
              </div>
            )}

            <div className="erp-table-container">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Course Code</th>
                    <th>Subject & Title</th>
                    <th>Exam Date</th>
                    <th>Timing & Duration</th>
                    <th>Exam Hall</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {fetchError ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-red-600 font-medium text-xs">
                        Failed to load examination timetable. Please try refreshing the page.
                      </td>
                    </tr>
                  ) : upcomingExamsList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 text-xs font-mono">
                        No data available
                      </td>
                    </tr>
                  ) : (
                    upcomingExamsList.map((exam, idx) => (
                      <tr key={exam.id || idx}>
                        <td className="font-mono font-bold text-[#1E40AF]">{exam.code}</td>
                        <td className="font-semibold text-slate-900">{exam.title}</td>
                        <td className="font-mono">{exam.date}</td>
                        <td className="text-slate-600 font-mono text-xs">{exam.time}</td>
                        <td className="font-medium text-slate-700">{exam.hall}</td>
                        <td>
                          <span className="erp-badge-blue">{exam.status}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: SEMESTER RESULTS */}
        {activeTab === 'RESULTS' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Semester Final Evaluation Results
              </h3>
              <span className="erp-badge-green font-mono">SGPA: --</span>
            </div>

            <div className="erp-table-container">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Course Code</th>
                    <th>Subject Name</th>
                    <th>CIA Marks (50)</th>
                    <th>ESE Marks (100)</th>
                    <th>Total Score</th>
                    <th>Letter Grade</th>
                    <th>Result Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentResultsList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 text-xs font-mono">
                        No data available
                      </td>
                    </tr>
                  ) : (
                    recentResultsList.map((res, idx) => (
                      <tr key={idx}>
                        <td className="font-mono font-bold text-[#1E40AF]">{res.code}</td>
                        <td className="font-semibold text-slate-900">{res.subject}</td>
                        <td className="font-mono text-slate-700">--</td>
                        <td className="font-mono text-slate-700">--</td>
                        <td className="font-mono font-bold text-[#1E40AF]">{res.score} / {res.totalMarks}</td>
                        <td className="font-semibold text-slate-900">--</td>
                        <td>
                          <span className="erp-badge-green">{res.status}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: ATTENDANCE SUMMARY */}
        {activeTab === 'ATTENDANCE' && (
          <div className="space-y-6">
            <div className="erp-card bg-slate-50 border-slate-200 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-800">Overall Attendance Compliance</h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  Minimum mandatory requirement for exam eligibility: <b>{user?.minAttendanceRequirement ? `${user.minAttendanceRequirement}%` : '--'}</b>
                </p>
              </div>
              <div className="text-slate-700 font-bold text-2xl font-mono">{studentProfile.attendancePercent}</div>
            </div>

            <div className="erp-table-container">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Course Code</th>
                    <th>Subject Title</th>
                    <th>Conducted Classes</th>
                    <th>Attended Classes</th>
                    <th>Attendance %</th>
                    <th>Eligibility Badge</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 text-xs font-mono">
                        No data available
                      </td>
                    </tr>
                  ) : (
                    attendanceBreakdown.map((att, idx) => (
                      <tr key={idx}>
                        <td className="font-mono font-bold text-[#1E40AF]">{att.code}</td>
                        <td className="font-semibold text-slate-900">{att.subject}</td>
                        <td className="font-mono">{att.total}</td>
                        <td className="font-mono text-emerald-700 font-bold">{att.attended}</td>
                        <td className="font-mono font-bold">{att.percent}%</td>
                        <td>
                          {att.percent >= (user?.minAttendanceRequirement ? Number(user.minAttendanceRequirement) : 100) ? (
                            <span className="erp-badge-green">ELIGIBLE</span>
                          ) : (
                            <span className="erp-badge-red">SHORTAGE</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: PERFORMANCE ANALYTICS */}
        {activeTab === 'ANALYTICS' && (
          <div className="space-y-4">
            {fetchError ? (
              <div className="erp-card bg-red-50 border border-red-200 text-red-800 p-4 text-xs flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>Unable to load performance analytics.</span>
                </div>
                <button onClick={() => fetchDashboardData()} className="erp-btn-secondary py-1 text-xs">
                  Retry
                </button>
              </div>
            ) : analyticsData ? (
              <StudentAnalyticsView data={analyticsData} />
            ) : (
              <div className="erp-card text-center py-12 text-slate-500 text-xs font-mono">
                No data available
              </div>
            )}
          </div>
        )}

        {/* TAB 6: CIRCULARS & NOTIFICATIONS */}
        {activeTab === 'NOTIFICATIONS' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Official Examination Circulars
            </h3>

            <div className="space-y-3">
              {notificationsList.length === 0 ? (
                <div className="erp-card text-center py-12 text-slate-500 text-xs font-mono">
                  No data available
                </div>
              ) : (
                notificationsList.map((notif) => (
                  <div key={notif.id} className="erp-card space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="erp-badge-red">{notif.badge}</span>
                        <h4 className="text-sm font-bold text-slate-900">{notif.title}</h4>
                      </div>
                      <span className="text-xs text-slate-500 font-mono">{notif.date}</span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed">{notif.content}</p>
                    <div className="text-[11px] text-slate-500 font-medium">Issued by: {notif.author}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 7: EXAMINATION HISTORY */}
        {activeTab === 'HISTORY' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Completed CBT Assessments Archive
              </h3>
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-[#1E40AF] top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Filter exam title..."
                  className="erp-input pl-9 text-xs py-1.5"
                />
              </div>
            </div>

            <div className="erp-table-container">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Exam Title</th>
                    <th>Exam Category</th>
                    <th>Score Obtained</th>
                    <th>Total Marks</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {completedExams.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-500 text-xs font-mono">
                        No data available
                      </td>
                    </tr>
                  ) : (
                    completedExams
                      .filter((item: any) =>
                        item.test?.title?.toLowerCase().includes(historySearch.toLowerCase())
                      )
                      .map((item: any) => (
                        <tr key={item.id}>
                          <td className="font-bold text-slate-900">{item.test?.title}</td>
                          <td className="font-mono text-xs">{item.test?.examType || '--'}</td>
                          <td className="font-mono font-bold text-emerald-700">{item.score}</td>
                          <td className="font-mono text-slate-600">{item.test?.totalMarks}</td>
                          <td>
                            <span className="erp-badge-green">{item.status}</span>
                          </td>
                          <td>
                            <button
                              onClick={() => router.push(`/student/solution/${item.id}`)}
                              className="erp-btn-secondary py-1 text-xs"
                            >
                              Review Solutions
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
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-3 px-6 text-center text-xs text-slate-500 mt-auto">
        Controller of Examinations • Central University Student Portal
      </footer>
    </div>
  );
}
