'use client';

import React, { useEffect, useState } from 'react';
import { ShieldAlert, Maximize2, AlertCircle } from 'lucide-react';

interface SecurityGuardProps {
  onViolation: (type: string, details?: string) => void;
  maxViolations: number;
  currentViolations: number;
}

export const SecurityGuard: React.FC<SecurityGuardProps> = ({
  onViolation,
  maxViolations,
  currentViolations,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');

  const requestFullscreen = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch (err) {
      console.warn('Fullscreen request rejected by browser:', err);
    }
  };

  useEffect(() => {
    // 1. Mandatory Fullscreen listener
    const handleFullscreenChange = () => {
      const isFull = Boolean(document.fullscreenElement);
      setIsFullscreen(isFull);
      if (!isFull) {
        onViolation('FULLSCREEN_EXIT', 'Exited mandatory exam fullscreen mode');
        setWarningMessage('SECURITY ALERT: Exiting fullscreen mode is recorded as an exam security infraction!');
        setShowWarningModal(true);
      }
    };

    // 2. Tab switch & visibility listener
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        onViolation('TAB_SWITCH', 'Switched browser tab or minimized window');
        setWarningMessage('SECURITY ALERT: Tab switching detected! Recorded and transmitted to invigilator.');
        setShowWarningModal(true);
      }
    };

    // 3. Window blur listener
    const handleWindowBlur = () => {
      onViolation('WINDOW_BLUR', 'Focus lost from exam browser window');
    };

    // 4. Keyboard Shortcuts Interceptor
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F12') {
        e.preventDefault();
        onViolation('DEVTOOLS', 'Attempted F12 DevTools access');
        return false;
      }

      if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) {
        e.preventDefault();
        onViolation('DEVTOOLS', 'Attempted DevTools shortcut');
        return false;
      }

      if (e.ctrlKey && ['C', 'V', 'U', 'P', 'S', 'A'].includes(e.key.toUpperCase())) {
        e.preventDefault();
        onViolation('KEYBOARD_SHORTCUT', `Attempted shortcut Ctrl+${e.key.toUpperCase()}`);
        return false;
      }
    };

    // 5. Context Menu & Selection Disabler
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      onViolation('RIGHT_CLICK', 'Attempted right click context menu');
      return false;
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [onViolation]);

  return (
    <>
      {/* Fullscreen Re-entry Banner if exited */}
      {!isFullscreen && (
        <div className="fixed inset-0 z-50 bg-slate-900/90 flex flex-col items-center justify-center p-6 text-center font-sans">
          <div className="erp-card max-w-md w-full p-8 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-100 text-red-600 mb-1 border border-red-200">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Exam Fullscreen Required</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              University examination governance policy requires continuous fullscreen execution. Exceeding maximum permitted security violations (<b>{maxViolations}</b>) will result in automatic submission.
            </p>

            <div className="bg-amber-50 border border-amber-200 rounded-md p-2.5 font-mono text-xs text-amber-900">
              Recorded Security Infractions: <b>{currentViolations} / {maxViolations}</b>
            </div>

            <button
              onClick={requestFullscreen}
              className="erp-btn-primary w-full py-2.5 text-xs font-semibold"
            >
              <Maximize2 className="w-4 h-4" />
              <span>Re-enter Fullscreen & Resume Exam</span>
            </button>
          </div>
        </div>
      )}

      {/* Temporary Warning Modal */}
      {showWarningModal && isFullscreen && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-300 text-red-900 px-5 py-2.5 rounded-md text-xs font-semibold flex items-center space-x-3 shadow-lg">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{warningMessage}</span>
          <button
            onClick={() => setShowWarningModal(false)}
            className="ml-3 text-[11px] bg-red-200 hover:bg-red-300 px-2 py-0.5 rounded text-red-900"
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  );
};
