'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, ShieldCheck, Lock, AlertCircle, ArrowRight, CheckCircle2, UserCheck, BookOpen } from 'lucide-react';
import api from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('ganesh@citchennai.net');
  const [registerNo, setRegisterNo] = useState('71762105042');
  const [role, setRole] = useState<'STUDENT' | 'FACULTY' | 'ADMIN'>('STUDENT');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    // Inline Validation
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Please enter a valid institutional email address.');
      return;
    }

    if (role === 'STUDENT' && !registerNo.trim()) {
      setErrorMsg('Register Number is mandatory for student authentication.');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/auth/google', {
        email: email.trim(),
        registerNo: registerNo.trim(),
        role,
        department: 'Computer Science & Engineering',
      });

      if (response.data?.success) {
        const token = response.data.token || response.data.data?.token;
        const userObj = response.data.user || response.data.data?.user;

        localStorage.setItem('gsmas_token', token);
        localStorage.setItem('gsmas_user', JSON.stringify(userObj));

        if (role === 'STUDENT') {
          router.push('/student/dashboard');
        } else if (role === 'FACULTY') {
          router.push('/faculty/invigilator');
        } else {
          router.push('/admin/dashboard');
        }
      } else {
        setErrorMsg(response.data?.message || 'Authentication failed. Please verify credentials.');
      }
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message || 'Authentication failed. Please use your official university domain account (@citchennai.net).'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSwitch = (selectedRole: 'STUDENT' | 'FACULTY' | 'ADMIN') => {
    setRole(selectedRole);
    setErrorMsg('');
    if (selectedRole === 'FACULTY') {
      setEmail('faculty@citchennai.net');
    } else if (selectedRole === 'ADMIN') {
      setEmail('admin@citchennai.net');
    } else {
      setEmail('ganesh@citchennai.net');
      setRegisterNo('71762105042');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between font-sans">
      {/* Top University Branding Bar */}
      <header className="bg-[#1E40AF] text-white border-b border-blue-900 px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white/10 rounded-md border border-white/20">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">Central University Examination Management System</h1>
              <p className="text-xs text-blue-200">Office of the Controller of Examinations • Academic Portal</p>
            </div>
          </div>
          <div className="hidden md:flex items-center space-x-4 text-xs text-blue-100">
            <span className="flex items-center space-x-1">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Secure Examination Gateway</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Login Card Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 my-8">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-sm p-6 sm:p-8 space-y-6">
          {/* Institutional Header */}
          <div className="text-center space-y-1">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 text-[#1E40AF] mb-2 border border-blue-100">
              <Lock className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Institutional Login</h2>
            <p className="text-xs text-slate-500">Sign in to access examination services and records</p>
          </div>

          {/* Institutional Domain Restriction Notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-900 flex items-start space-x-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Restricted Access Notice:</span> Only authorized institutional domain accounts (e.g. <b>@citchennai.net</b>) are permitted to sign in.
            </div>
          </div>

          {/* Error Message Box */}
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-800 flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Role Switcher */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Portal Role Selection
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['STUDENT', 'FACULTY', 'ADMIN'] as const).map((r) => (
                  <button
                    type="button"
                    key={r}
                    onClick={() => handleRoleSwitch(r)}
                    className={`py-2 px-3 text-xs font-semibold rounded-md border transition-colors ${
                      role === r
                        ? 'bg-[#1E40AF] text-white border-[#1E40AF] shadow-sm'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {r === 'STUDENT' ? 'Student' : r === 'FACULTY' ? 'Faculty' : 'Administrator'}
                  </button>
                ))}
              </div>
            </div>

            {/* Email Field */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Institutional Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="ananya.sharma@citchennai.net"
                className="erp-input"
              />
            </div>

            {/* Register Number Field for Student */}
            {role === 'STUDENT' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  University Register Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={registerNo}
                  onChange={(e) => setRegisterNo(e.target.value)}
                  required
                  placeholder="71762105042"
                  className="erp-input font-mono"
                />
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="erp-btn-primary w-full py-2.5 text-sm"
            >
              {loading ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Authenticating Credentials...</span>
                </div>
              ) : (
                <>
                  <span>Sign In to Examination Portal</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-200 text-center text-[11px] text-slate-500">
            Automated Evaluation & Continuous Assessment Gateway • EMS v4.2
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-3 px-6 text-center text-xs text-slate-500">
        © 2026 Central University Office of the Controller of Examinations. All Rights Reserved.
      </footer>
    </div>
  );
}
