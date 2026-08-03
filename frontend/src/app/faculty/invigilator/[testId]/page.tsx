'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Shield, Radio, AlertTriangle, CheckCircle2, Download, LogOut } from 'lucide-react';
import io from 'socket.io-client';
import api from '@/lib/api';
import { RiskTierTable, LiveStudent } from '@/components/invigilator/RiskTierTable';

export default function InvigilatorDashboard() {
  const router = useRouter();
  const params = useParams();
  const testId = (params.testId as string) || 'test-demo-123';

  const [students, setStudents] = useState<LiveStudent[]>([]);
  const [testTitle, setTestTitle] = useState('GATE CS All-India Mock Test');
  const [socketConnected, setSocketConnected] = useState(false);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';
    const socket = io(socketUrl);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log(`🔌 [Faculty Socket] Connected to server socket: ${socket.id}`);
      setSocketConnected(true);
      console.log(`👨‍🏫 [Faculty Socket] Emitting join_faculty_room for testId: ${testId}`);
      socket.emit('join_faculty_room', { testId });
    });

    socket.on('live_students_snapshot', (snapshot: LiveStudent[]) => {
      console.log(`📸 [Faculty Socket] Received live_students_snapshot (${snapshot.length} students):`, snapshot);
      setStudents(snapshot);
    });

    socket.on('student_status_changed', (student: LiveStudent) => {
      console.log(`🔄 [Faculty Socket] Received student_status_changed:`, student);
      setStudents(prev => {
        const idx = prev.findIndex(s => s.assignmentId === student.assignmentId);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = student;
          return copy;
        }
        return [...prev, student];
      });
    });

    socket.on('student_progress_updated', (data: any) => {
      console.log(`⏱️ [Faculty Socket] Received student_progress_updated:`, data);
      setStudents(prev =>
        prev.map(s =>
          s.assignmentId === data.assignmentId
            ? { ...s, currentQuestion: data.currentQuestion, remainingSec: data.remainingSec, status: data.status }
            : s
        )
      );
    });

    socket.on('student_violation_logged', (vData: any) => {
      console.warn(`🚨 [Faculty Socket] Received student_violation_logged:`, vData);
      setStudents(prev =>
        prev.map(s =>
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
    if (confirm('Are you sure you want to remotely terminate and submit this student exam?')) {
      if (socketRef.current) {
        socketRef.current.emit('faculty_force_submit', {
          assignmentId,
          reason: 'Invigilator issued manual termination due to security risk.',
        });
      }
    }
  };

  const handleExportReport = (format: string) => {
    const token = localStorage.getItem('gsmas_token');
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    window.open(`${apiUrl}/admin/export-report/${testId}?format=${format}&token=${token}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Invigilator Navbar */}
      <header className="glass-panel border-b border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold text-white tracking-tight">{testTitle}</h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                {socketConnected ? '● Live Socket Gateway Connected' : 'Connecting...'}
              </span>
            </div>
            <p className="text-xs text-slate-400">Faculty Live Invigilation & Security Monitor</p>
          </div>
        </div>

        {/* Action Controls & Export */}
        <div className="flex items-center space-x-4">
          <div className="flex space-x-2">
            <button
              onClick={() => handleExportReport('excel')}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold rounded-lg flex items-center space-x-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel</span>
            </button>
            <button
              onClick={() => handleExportReport('pdf')}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold rounded-lg flex items-center space-x-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>
          </div>

          <button
            onClick={() => router.push('/')}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-800"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Invigilator Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        <RiskTierTable
          students={students}
          onSendWarning={handleSendWarning}
          onForceSubmit={handleForceSubmit}
        />
      </main>
    </div>
  );
}
