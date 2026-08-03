'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, BookOpen, UserCheck, AlertCircle, ArrowRight, Lock } from 'lucide-react';
import api from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('ganesh@cit.edu.in');
  const [registerNo, setRegisterNo] = useState('71762105001');
  const [role, setRole] = useState<'STUDENT' | 'FACULTY' | 'ADMIN'>('STUDENT');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      const response = await api.post('/auth/google', {
        email,
        registerNo,
        role,
        department: 'CSE',
      });

      if (response.data.success) {
        const token = response.data.token || response.data.data?.token;
        const userObj = response.data.user || response.data.data?.user;

        localStorage.setItem('gsmas_token', token);
        localStorage.setItem('gsmas_user', JSON.stringify(userObj));

        if (role === 'STUDENT') {
          router.push('/student/dashboard');
        } else if (role === 'FACULTY') {
          router.push('/faculty/invigilator/test-demo-123');
        } else {
          router.push('/admin/dashboard');
        }
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Authentication failed. Please use your official college domain (@cit.edu.in).');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950 via-slate-950 to-slate-950 overflow-hidden">
      {/* Background Decorative Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md glass-panel p-8 rounded-3xl border border-slate-800 shadow-2xl z-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 mb-2">
            <Shield className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">GSMAS Examination Portal</h1>
          <p className="text-xs text-slate-400">
            GATE Secure Mock Test & Institutional Analytics Platform
          </p>
        </div>

        {/* Allowed Domain Info Badge */}
        <div className="bg-indigo-950/50 border border-indigo-500/20 rounded-xl p-3 text-xs text-indigo-300 flex items-center space-x-2">
          <Lock className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>Restricted Access: Google College Account Only (e.g. <b>@cit.edu.in</b>)</span>
        </div>

        {errorMsg && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-xs text-rose-400 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              College Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="student@cit.edu.in"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition-all"
            />
          </div>

          {role === 'STUDENT' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Register Number
              </label>
              <input
                type="text"
                value={registerNo}
                onChange={e => setRegisterNo(e.target.value)}
                placeholder="71762105001"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 font-mono focus:outline-none focus:border-indigo-500 transition-all"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Role Selection
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['STUDENT', 'FACULTY', 'ADMIN'] as const).map(r => (
                <button
                  type="button"
                  key={r}
                  onClick={() => {
                    setRole(r);
                    if (r === 'FACULTY') setEmail('faculty@cit.edu.in');
                    else if (r === 'ADMIN') setEmail('admin@cit.edu.in');
                    else setEmail('ganesh@cit.edu.in');
                  }}
                  className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                    role === r
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 font-bold text-white text-sm rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center space-x-2"
          >
            {loading ? (
              <span>Authenticating Google OAuth...</span>
            ) : (
              <>
                <span>Sign In with College Account</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-800 text-center text-xs text-slate-500">
          Supervised Institutional Examination Engine • GSMAS v1.0
        </div>
      </div>
    </div>
  );
}
