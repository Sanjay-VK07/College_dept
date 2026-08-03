'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, CheckCircle, Clock, Award, BarChart2, LogOut, Shield } from 'lucide-react';
import api from '@/lib/api';
import { StudentAnalyticsView } from '@/components/analytics/StudentAnalyticsView';

export default function StudentDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [tests, setTests] = useState<any[]>([]);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'EXAMS' | 'ANALYTICS'>('EXAMS');
  const [loading, setLoading] = useState(true);

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

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [testRes, analyticsRes] = await Promise.all([
        api.get('/exam/student-tests'),
        api.get('/analytics/student-me'),
      ]);

      if (testRes.data?.success) setTests(testRes.data.data);
      if (analyticsRes.data?.success) setAnalyticsData(analyticsRes.data.data);
    } catch (err) {
      console.error('Error fetching student dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push('/');
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mr-3" />
        Loading Student Workspace...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="glass-panel border-b border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">GSMAS Student Portal</h1>
            <p className="text-xs text-slate-400">CIT College of Engineering & Technology</p>
          </div>
        </div>

        {/* User Identity Info */}
        <div className="flex items-center space-x-6">
          <div className="text-right">
            <div className="text-sm font-semibold text-white">{user.name}</div>
            <div className="text-xs text-indigo-400 font-mono">
              Reg: {user.registerNo || 'N/A'} • {user.department} (Yr {user.year || 3})
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-800 transition-all"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex space-x-4 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('EXAMS')}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center space-x-2 ${
              activeTab === 'EXAMS' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-900'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Assigned Mock Tests</span>
          </button>

          <button
            onClick={() => setActiveTab('ANALYTICS')}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center space-x-2 ${
              activeTab === 'ANALYTICS' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-900'
            }`}
          >
            <BarChart2 className="w-4 h-4" />
            <span>Personal Performance Analytics</span>
          </button>
        </div>

        {activeTab === 'EXAMS' ? (
          <div className="space-y-6">
            <h2 className="text-base font-bold text-slate-200 uppercase tracking-wider">Available Examination Papers</h2>
            <div className="grid grid-cols-2 gap-6">
              {tests.length === 0 ? (
                <div className="col-span-2 glass-card p-12 text-center text-slate-500 rounded-2xl">
                  No mock exams currently assigned to your cohort.
                </div>
              ) : (
                tests.map((assignment: any) => (
                  <div key={assignment.id} className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4 hover:border-indigo-500/40 transition-all">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          {assignment.test.examType || 'GATE MOCK'}
                        </span>
                        <h3 className="text-lg font-bold text-white mt-2">{assignment.test.title}</h3>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{assignment.test.description}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-emerald-400">{assignment.test.totalMarks} Marks</div>
                        <div className="text-xs text-slate-500">{assignment.test.durationMinutes} Minutes</div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                      <div className="text-xs text-slate-400 flex items-center space-x-2">
                        <span>Max Violations: <b>{assignment.test.maxViolations || 5}</b></span>
                      </div>

                      {assignment.status === 'COMPLETED' ? (
                        <div className="flex items-center space-x-3">
                          <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                            Score: {assignment.score}/{assignment.test.totalMarks}
                          </span>
                          <button
                            onClick={() => router.push(`/student/solution/${assignment.id}`)}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 rounded-xl"
                          >
                            Review Solutions
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => router.push(`/student/exam/${assignment.test.id}`)}
                          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center space-x-1.5"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Start GATE Exam</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          analyticsData && <StudentAnalyticsView data={analyticsData} />
        )}
      </main>
    </div>
  );
}
