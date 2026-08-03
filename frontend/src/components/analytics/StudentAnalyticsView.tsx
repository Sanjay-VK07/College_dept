'use client';

import React from 'react';
import { Target, Zap, Award, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line } from 'recharts';

interface TopicStat {
  topic: string;
  subject: string;
  accuracy: number;
  total: number;
}

interface AttemptHistory {
  testTitle: string;
  date: string;
  score: number;
  totalMarks: number;
  accuracy: number;
}

interface StudentAnalyticsData {
  overallAccuracy: number;
  avgTimePerQuestion: number;
  totalExamsCompleted: number;
  strongTopics: TopicStat[];
  weakTopics: TopicStat[];
  topicAccuracy: TopicStat[];
  historyGraph: AttemptHistory[];
}

export const StudentAnalyticsView: React.FC<{ data: StudentAnalyticsData }> = ({ data }) => {
  return (
    <div className="space-y-6">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-3 gap-6">
        <div className="glass-panel p-6 rounded-2xl border border-slate-800">
          <div className="flex items-center space-x-3 text-emerald-400 mb-2">
            <Target className="w-5 h-5" />
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">Overall Accuracy</span>
          </div>
          <div className="text-3xl font-bold text-white">{data.overallAccuracy}%</div>
          <p className="text-xs text-slate-500 mt-1">GATE target benchmark: &gt;75%</p>
        </div>

        <div className="glass-panel p-6 rounded-2xl border border-slate-800">
          <div className="flex items-center space-x-3 text-indigo-400 mb-2">
            <Zap className="w-5 h-5" />
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">Avg Speed per Qn</span>
          </div>
          <div className="text-3xl font-bold text-white">{data.avgTimePerQuestion} sec</div>
          <p className="text-xs text-slate-500 mt-1">GATE recommended: 120-180 sec</p>
        </div>

        <div className="glass-panel p-6 rounded-2xl border border-slate-800">
          <div className="flex items-center space-x-3 text-amber-400 mb-2">
            <Award className="w-5 h-5" />
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">Mock Exams Completed</span>
          </div>
          <div className="text-3xl font-bold text-white">{data.totalExamsCompleted}</div>
          <p className="text-xs text-slate-500 mt-1">Verified college exam sessions</p>
        </div>
      </div>

      {/* Weak & Strong Topic Highlights */}
      <div className="grid grid-cols-2 gap-6">
        {/* Strong Topics */}
        <div className="glass-card p-6 rounded-2xl border border-emerald-500/20">
          <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider mb-4 flex items-center">
            <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-400" />
            Strong Topics (Top Performers)
          </h3>
          <div className="space-y-3">
            {data.strongTopics.map((t, idx) => (
              <div key={idx} className="flex justify-between items-center bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                <div>
                  <div className="text-sm font-semibold text-slate-200">{t.topic}</div>
                  <div className="text-xs text-slate-500">{t.subject}</div>
                </div>
                <div className="text-emerald-400 font-bold text-sm bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                  {t.accuracy}%
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Weak Topics */}
        <div className="glass-card p-6 rounded-2xl border border-rose-500/20">
          <h3 className="text-sm font-bold text-rose-400 uppercase tracking-wider mb-4 flex items-center">
            <AlertCircle className="w-4 h-4 mr-2 text-rose-400" />
            Weak Topics (Focus Needed)
          </h3>
          <div className="space-y-3">
            {data.weakTopics.map((t, idx) => (
              <div key={idx} className="flex justify-between items-center bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                <div>
                  <div className="text-sm font-semibold text-slate-200">{t.topic}</div>
                  <div className="text-xs text-slate-500">{t.subject}</div>
                </div>
                <div className="text-rose-400 font-bold text-sm bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20">
                  {t.accuracy}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Topic Accuracy Bar Chart */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-6">Topic-wise Accuracy Breakdown</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.topicAccuracy}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="topic" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 100]} />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }} />
              <Bar dataKey="accuracy" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Score Progress Line Graph */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-6">Score Progress Across Mock Exams</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.historyGraph}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="testTitle" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }} />
              <Line type="monotone" dataKey="score" stroke="#10b981" strokeWidth={3} dot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
