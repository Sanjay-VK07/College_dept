'use client';

import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, CheckCircle, Radio, Send, Power, Search, Filter } from 'lucide-react';

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
  const [searchQuery, setSearchQuery] = useState('');

  const safeCount = students.filter((s) => s.riskLevel === 'SAFE').length;
  const warningCount = students.filter((s) => s.riskLevel === 'WARNING').length;
  const highRiskCount = students.filter((s) => s.riskLevel === 'HIGH_RISK').length;

  const filteredStudents = students.filter((s) => {
    const matchesRisk = filterRisk === 'ALL' || s.riskLevel === filterRisk;
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.registerNo && s.registerNo.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesRisk && matchesSearch;
  });

  const getRiskBadge = (risk: string) => {
    if (risk === 'SAFE') {
      return <span className="erp-badge-green">🟢 Safe</span>;
    } else if (risk === 'WARNING') {
      return <span className="erp-badge-amber">🟡 Warning</span>;
    } else {
      return <span className="erp-badge-red font-bold animate-pulse">🔴 High Risk</span>;
    }
  };

  return (
    <div className="space-y-4 font-sans">
      {/* Risk Filter Metrics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={() => setFilterRisk('ALL')}
          className={`erp-card text-left transition-all ${
            filterRisk === 'ALL' ? 'border-[#1E40AF] ring-2 ring-[#1E40AF]/20' : ''
          }`}
        >
          <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Total Active Candidates</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{students.length}</div>
        </button>

        <button
          onClick={() => setFilterRisk('SAFE')}
          className={`erp-card text-left transition-all ${
            filterRisk === 'SAFE' ? 'border-emerald-600 ring-2 ring-emerald-600/20' : ''
          }`}
        >
          <div className="text-xs text-emerald-700 font-semibold flex items-center">
            <Radio className="w-3.5 h-3.5 mr-1" /> Safe Cohort
          </div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{safeCount}</div>
        </button>

        <button
          onClick={() => setFilterRisk('WARNING')}
          className={`erp-card text-left transition-all ${
            filterRisk === 'WARNING' ? 'border-amber-600 ring-2 ring-amber-600/20' : ''
          }`}
        >
          <div className="text-xs text-amber-700 font-semibold flex items-center">
            <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Warning Cohort
          </div>
          <div className="text-2xl font-bold text-amber-700 mt-1">{warningCount}</div>
        </button>

        <button
          onClick={() => setFilterRisk('HIGH_RISK')}
          className={`erp-card text-left transition-all ${
            filterRisk === 'HIGH_RISK' ? 'border-red-600 ring-2 ring-red-600/20' : ''
          }`}
        >
          <div className="text-xs text-red-700 font-semibold flex items-center">
            <ShieldAlert className="w-3.5 h-3.5 mr-1" /> High Risk Cohort
          </div>
          <div className="text-2xl font-bold text-red-700 mt-1">{highRiskCount}</div>
        </button>
      </div>

      {/* Table Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search candidate name or reg no..."
            className="erp-input pl-9 text-xs py-1.5"
          />
        </div>
        <div className="text-xs text-slate-500 font-mono">
          Live Monitoring • Auto Refreshing via WebSocket Gateway
        </div>
      </div>

      {/* Live Table */}
      <div className="erp-table-container">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Register No & Candidate</th>
              <th>Department</th>
              <th>Current Qn</th>
              <th>Time Remaining</th>
              <th>Security Violations</th>
              <th>Risk Tier</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                  No live examinees matching selected risk filter.
                </td>
              </tr>
            ) : (
              filteredStudents.map((student) => (
                <tr key={student.assignmentId}>
                  <td>
                    <div className="font-bold text-slate-900">{student.name}</div>
                    <div className="text-xs text-slate-500 font-mono">{student.registerNo || '71762105042'}</div>
                  </td>
                  <td className="font-mono text-xs text-slate-700">{student.department}</td>
                  <td className="text-[#1E40AF] font-bold">Q{student.currentQuestion}</td>
                  <td className="font-mono text-xs text-emerald-700 font-bold">
                    {Math.floor(student.remainingSec / 60)}m {student.remainingSec % 60}s
                  </td>
                  <td className="font-bold text-red-700">{student.violationCount}</td>
                  <td>{getRiskBadge(student.riskLevel)}</td>
                  <td>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setSelectedStudent(student)}
                        className="erp-btn-secondary py-1 px-2.5 text-xs text-amber-800 border-amber-300 bg-amber-50 hover:bg-amber-100"
                      >
                        <Send className="w-3 h-3 mr-1" /> Issue Warning
                      </button>
                      <button
                        onClick={() => onForceSubmit(student.assignmentId)}
                        className="erp-btn-danger py-1 px-2.5 text-xs"
                      >
                        <Power className="w-3 h-3 mr-1" /> Terminate
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Warning Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="erp-card max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center">
              <AlertTriangle className="w-5 h-5 text-amber-600 mr-2" />
              Issue Official Invigilator Notice
            </h3>

            <div className="text-xs text-slate-600">
              Candidate: <b>{selectedStudent.name}</b> (Reg: <span className="font-mono">{selectedStudent.registerNo}</span>)
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Notice Message Text:
              </label>
              <textarea
                value={warningText}
                onChange={(e) => setWarningText(e.target.value)}
                placeholder="e.g. Mandatory requirement: Maintain continuous fullscreen mode. Further security infractions will result in immediate termination."
                className="erp-input h-28 py-2 text-xs"
              />
            </div>

            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setSelectedStudent(null)}
                className="erp-btn-secondary text-xs"
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
                className="erp-btn-primary text-xs"
              >
                Transmit Warning Notice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
