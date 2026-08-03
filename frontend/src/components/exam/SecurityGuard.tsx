'use client';

import React, { useEffect, useState } from 'react';
import { ShieldAlert, Maximize2 } from 'lucide-react';

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
        setWarningMessage('WARNING: Exiting Fullscreen is recorded as a security violation!');
        setShowWarningModal(true);
      }
    };

    // 2. Tab switch & visibility listener
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        onViolation('TAB_SWITCH', 'Switched browser tab or minimized window');
        setWarningMessage('SECURITY ALERT: Tab switching detected! Activity reported to faculty.');
        setShowWarningModal(true);
      }
    };

    // 3. Window blur listener
    const handleWindowBlur = () => {
      onViolation('WINDOW_BLUR', 'Focus lost from exam browser window');
    };

    // 4. Keyboard Shortcuts Interceptor
    const handleKeyDown = (e: KeyboardEvent) => {
      // Block F12
      if (e.key === 'F12') {
        e.preventDefault();
        onViolation('DEVTOOLS', 'Attempted F12 DevTools access');
        return false;
      }

      // Block Ctrl+Shift+I / J / C
      if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) {
        e.preventDefault();
        onViolation('DEVTOOLS', 'Attempted DevTools shortcut');
        return false;
      }

      // Block Ctrl+C, Ctrl+V, Ctrl+U, Ctrl+P, Ctrl+S
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
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center">
          <ShieldAlert className="w-16 h-16 text-rose-500 mb-4 animate-bounce" />
          <h2 className="text-2xl font-bold text-white mb-2">Exam Fullscreen Required</h2>
          <p className="text-slate-400 max-w-md mb-6 text-sm">
            GSMAS exam security policy requires continuous fullscreen execution. Exceeding maximum allowed violations ({maxViolations}) will auto-submit your test.
          </p>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 mb-6 font-mono text-xs text-amber-400">
            Recorded Security Violations: {currentViolations} / {maxViolations}
          </div>

          <button
            onClick={requestFullscreen}
            className="flex items-center space-x-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 font-semibold text-white rounded-lg shadow-lg shadow-indigo-600/30 transition-all"
          >
            <Maximize2 className="w-5 h-5" />
            <span>Re-enter Fullscreen & Continue</span>
          </button>
        </div>
      )}

      {/* Temporary Warning Modal */}
      {showWarningModal && isFullscreen && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 glass-panel px-6 py-3 rounded-full border border-rose-500/40 text-rose-300 text-sm font-medium flex items-center space-x-3 shadow-2xl animate-pulse">
          <ShieldAlert className="w-5 h-5 text-rose-500" />
          <span>{warningMessage}</span>
          <button
            onClick={() => setShowWarningModal(false)}
            className="ml-3 text-xs bg-rose-500/20 px-2 py-0.5 rounded text-rose-200"
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  );
};
