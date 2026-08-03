'use client';

import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, CheckCircle, Radio, Send, Power } from 'lucide-react';

export interface LiveStudent {
  assignmentId: string;
  studentId: string;
  registerNo: string;
  name: string;
  department: string;
  currentQuestion: number;
  remainingSec: number;
  violationCount: number;
  riskLevel: 'SAFE' | 'WARNING' | 'HIGH_RISK';
  status: 'ONLINE' | 'OFFLINE' | 'DISCONNECTED';
  lastSeen: Date;
}

interface RiskTierTableProps {
  students: LiveStudent[];
  onSendWarning: (assignmentId: string, message: string) => void;
  onForceSubmit: (assignmentId: string) => void;
}

export const RiskTierTable: React.FC<RiskTierTableProps> = ({
  students,
  onSendWarning,
  onForceSubmit,
}) => {
  const [filterRisk, setFilterRisk] = useState<'ALL' | 'SAFE' | 'WARNING' | 'HIGH_RISK'>('ALL');
  const [selectedStudent, setSelectedStudent] = useState<LiveStudent | null>(null);
  const [warningText, setWarningText] = useState('');

  const safeCount = students.filter(s => s.riskLevel === 'SAFE').length;
  const warningCount = students.filter(s => s.riskLevel === 'WARNING').length;
  const highRiskCount = students.filter(s => s.riskLevel === 'HIGH_RISK').length;

  const filteredStudents = students.filter(s => filterRisk === 'ALL' || s.riskLevel === filterRisk);

  const getRiskBadge = (risk: string) => {
    if (risk === 'SAFE') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle className="w-3 h-3 mr-1" />
          🟢 Safe
        </span>
      );
    } else if (risk === 'WARNING') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <AlertTriangle className="w-3 h-3 mr-1" />
          🟡 Warning
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse">
          <ShieldAlert className="w-3 h-3 mr-1" />
          🔴 High Risk
        </span>
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Risk Filter Cards */}
      <div className="grid grid-cols-4 gap-4">
        <button
          onClick={() => setFilterRisk('ALL')}
          className={`p-4 rounded-xl border transition-all text-left ${filterRisk === 'ALL' ? 'bg-indigo-600/20 border-indigo-500' : 'glass-card border-slate-800'}`}
        >
          <div className="text-xs text-slate-400 font-medium">Total Live Students</div>
          <div className="text-2xl font-bold text-white mt-1">{students.length}</div>
        </button>

        <button
          onClick={() => setFilterRisk('SAFE')}
          className={`p-4 rounded-xl border transition-all text-left ${filterRisk === 'SAFE' ? 'bg-emerald-600/20 border-emerald-500' : 'glass-card border-slate-800'}`}
        >
          <div className="text-xs text-emerald-400 font-medium flex items-center">
            <Radio className="w-3 h-3 mr-1" /> 🟢 Safe Cohort
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{safeCount}</div>
        </button>

        <button
          onClick={() => setFilterRisk('WARNING')}
          className={`p-4 rounded-xl border transition-all text-left ${filterRisk === 'WARNING' ? 'bg-amber-600/20 border-amber-500' : 'glass-card border-slate-800'}`}
        >
          <div className="text-xs text-amber-400 font-medium flex items-center">
            <AlertTriangle className="w-3 h-3 mr-1" /> 🟡 Warning Cohort
          </div>
          <div className="text-2xl font-bold text-amber-400 mt-1">{warningCount}</div>
        </button>

        <button
          onClick={() => setFilterRisk('HIGH_RISK')}
          className={`p-4 rounded-xl border transition-all text-left ${filterRisk === 'HIGH_RISK' ? 'bg-rose-600/20 border-rose-500' : 'glass-card border-slate-800'}`}
        >
          <div className="text-xs text-rose-400 font-medium flex items-center">
            <ShieldAlert className="w-3 h-3 mr-1" /> 🔴 High Risk Cohort
          </div>
          <div className="text-2xl font-bold text-rose-400 mt-1">{highRiskCount}</div>
        </button>
      </div>

      {/* Live Table */}
      <div className="glass-panel rounded-xl overflow-hidden border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900/80 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
            <tr>
              <th className="py-3.5 px-4">Reg No & Student</th>
              <th className="py-3.5 px-4">Dept</th>
              <th className="py-3.5 px-4">Current Qn</th>
              <th className="py-3.5 px-4">Time Left</th>
              <th className="py-3.5 px-4">Violations</th>
              <th className="py-3.5 px-4">Risk Tier</th>
              <th className="py-3.5 px-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500 text-sm">
                  No active students matching the selected risk tier filter.
                </td>
              </tr>
            ) : (
              filteredStudents.map(student => (
                <tr key={student.assignmentId} className="hover:bg-slate-900/40 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-medium text-white">{student.name}</div>
                    <div className="text-xs text-slate-400 font-mono">{student.registerNo || 'N/A'}</div>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-300">{student.department}</td>
                  <td className="py-3 px-4 text-indigo-400 font-bold">Q{student.currentQuestion}</td>
                  <td className="py-3 px-4 font-mono text-xs text-emerald-400">
                    {Math.floor(student.remainingSec / 60)}m {student.remainingSec % 60}s
                  </td>
                  <td className="py-3 px-4 font-bold text-rose-400">{student.violationCount}</td>
                  <td className="py-3 px-4">{getRiskBadge(student.riskLevel)}</td>
                  <td className="py-3 px-4 space-x-2">
                    <button
                      onClick={() => setSelectedStudent(student)}
                      className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-xs font-medium inline-flex items-center"
                    >
                      <Send className="w-3 h-3 mr-1" /> Warn
                    </button>
                    <button
                      onClick={() => onForceSubmit(student.assignmentId)}
                      className="px-2.5 py-1 rounded bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 text-xs font-medium inline-flex items-center"
                    >
                      <Power className="w-3 h-3 mr-1" /> Terminate
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Warning Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel p-6 rounded-xl max-w-md w-full border border-amber-500/30 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center">
              <AlertTriangle className="w-5 h-5 text-amber-400 mr-2" />
              Issue Invigilator Warning to {selectedStudent.name}
            </h3>

            <p className="text-xs text-slate-400">
              Student Register No: <span className="font-mono text-slate-200">{selectedStudent.registerNo}</span>
            </p>

            <textarea
              value={warningText}
              onChange={e => setWarningText(e.target.value)}
              placeholder="e.g. Please refrain from leaving full screen mode. Next infraction will terminate exam."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500 h-28"
            />

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setSelectedStudent(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (warningText.trim()) {
                    onSendWarning(selectedStudent.assignmentId, warningText);
                    setSelectedStudent(null);
                    setWarningText('');
                  }
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded text-white text-sm font-bold shadow-lg shadow-amber-600/30"
              >
                Send Warning
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
