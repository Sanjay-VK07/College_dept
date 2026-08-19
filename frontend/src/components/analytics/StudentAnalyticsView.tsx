'use client';

import React from 'react';
import { Target, Zap, Award, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface TopicStat {
  id: string;
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
  overallAccuracy: number | null;
  avgTimePerQuestion: number | null;
  totalExamsCompleted: number;
  analyticsEligibleExams?: number;
  strongTopics: TopicStat[];
  weakTopics: TopicStat[];
  topicAccuracy: TopicStat[];
  historyGraph: AttemptHistory[];
}

export const StudentAnalyticsView: React.FC<{ data: StudentAnalyticsData }> = ({ data }) => {
  const hasNoData =
    !data ||
    data.totalExamsCompleted === 0 ||
    (data.overallAccuracy === null &&
      data.avgTimePerQuestion === null &&
      (!data.strongTopics || data.strongTopics.length === 0) &&
      (!data.weakTopics || data.weakTopics.length === 0) &&
      (!data.topicAccuracy || data.topicAccuracy.length === 0));

  if (hasNoData) {
    return (
      <div className="erp-card text-center py-12 text-slate-500 text-xs font-mono">
        No data available
      </div>
    );
  }

  // Rule 11: Strict Null Handling
  const overallAccuracyDisplay =
    data.overallAccuracy !== null &&
    data.overallAccuracy !== undefined &&
    Number.isFinite(data.overallAccuracy)
      ? `${data.overallAccuracy}%`
      : '--';

  const avgSpeedDisplay =
    data.avgTimePerQuestion !== null &&
    data.avgTimePerQuestion !== undefined &&
    Number.isFinite(data.avgTimePerQuestion)
      ? `${data.avgTimePerQuestion} sec`
      : '--';

  const completedCountDisplay =
    data.totalExamsCompleted !== null &&
    data.totalExamsCompleted !== undefined &&
    Number.isFinite(data.totalExamsCompleted)
      ? data.totalExamsCompleted
      : '--';

  return (
    <div className="space-y-6 font-sans">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="erp-card">
          <div className="flex items-center space-x-2 text-emerald-700 mb-2">
            <Target className="w-5 h-5" />
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">Overall Accuracy</span>
          </div>
          <div className="text-3xl font-bold text-slate-900">{overallAccuracyDisplay}</div>
          <p className="text-xs text-slate-500 mt-1">Evaluated performance accuracy</p>
        </div>

        <div className="erp-card">
          <div className="flex items-center space-x-2 text-[#1E40AF] mb-2">
            <Zap className="w-5 h-5" />
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">Avg Speed per Qn</span>
          </div>
          <div className="text-3xl font-bold text-slate-900">{avgSpeedDisplay}</div>
          <p className="text-xs text-slate-500 mt-1">Evaluated speed per question</p>
        </div>

        <div className="erp-card">
          <div className="flex items-center space-x-2 text-amber-700 mb-2">
            <Award className="w-5 h-5" />
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">Completed Assessments</span>
          </div>
          <div className="text-3xl font-bold text-slate-900">{completedCountDisplay}</div>
          <p className="text-xs text-slate-500 mt-1">Verified examination records</p>
        </div>
      </div>

      {/* Strong & Focus Topic Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Strong Topics */}
        <div className="erp-card border-l-4 border-l-emerald-600 space-y-3">
          <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center">
            <CheckCircle2 className="w-4 h-4 mr-1.5 text-emerald-600" />
            Strong Performance Topics
          </h3>
          <div className="space-y-2">
            {!data.strongTopics || data.strongTopics.length === 0 ? (
              <div className="text-xs text-slate-500 font-mono py-4 text-center">
                No data available
              </div>
            ) : (
              data.strongTopics.map((t) => (
                <div key={t.id || t.topic} className="flex justify-between items-center bg-slate-50 p-2.5 rounded border border-slate-200 text-xs">
                  <div>
                    <div className="font-semibold text-slate-900">{t.topic}</div>
                    <div className="text-slate-500 text-[11px]">{t.subject}</div>
                  </div>
                  <span className="erp-badge-green font-mono">{t.accuracy}%</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Focus Topics */}
        <div className="erp-card border-l-4 border-l-red-600 space-y-3">
          <h3 className="text-xs font-bold text-red-800 uppercase tracking-wider flex items-center">
            <AlertCircle className="w-4 h-4 mr-1.5 text-red-600" />
            Topics Needing Review
          </h3>
          <div className="space-y-2">
            {!data.weakTopics || data.weakTopics.length === 0 ? (
              <div className="text-xs text-slate-500 font-mono py-4 text-center">
                No data available
              </div>
            ) : (
              data.weakTopics.map((t) => (
                <div key={t.id || t.topic} className="flex justify-between items-center bg-slate-50 p-2.5 rounded border border-slate-200 text-xs">
                  <div>
                    <div className="font-semibold text-slate-900">{t.topic}</div>
                    <div className="text-slate-500 text-[11px]">{t.subject}</div>
                  </div>
                  <span className="erp-badge-red font-mono">{t.accuracy}%</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Topic-wise Accuracy Chart */}
      <div className="erp-card space-y-4">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Subject & Topic Accuracy Breakdown</h3>
        <div className="h-60 w-full">
          {!data.topicAccuracy || data.topicAccuracy.length === 0 ? (
            <div className="text-xs text-slate-500 font-mono flex items-center justify-center h-full">
              No data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.topicAccuracy}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="topic" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} domain={[0, 100]} />
                <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '6px', color: '#0f172a' }} />
                <Bar dataKey="accuracy" fill="#1E40AF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};
