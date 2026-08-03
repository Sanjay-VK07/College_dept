'use client';

import React, { useState } from 'react';
import { X, Calculator } from 'lucide-react';

interface CalculatorProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GateScientificCalculator: React.FC<CalculatorProps> = ({ isOpen, onClose }) => {
  const [display, setDisplay] = useState('0');
  const [isRad, setIsRad] = useState(true);
  const [memory, setMemory] = useState(0);

  if (!isOpen) return null;

  const handleNum = (n: string) => {
    setDisplay(prev => (prev === '0' ? n : prev + n));
  };

  const handleOp = (op: string) => {
    setDisplay(prev => prev + ' ' + op + ' ');
  };

  const handleClear = () => setDisplay('0');

  const handleCalculate = () => {
    try {
      // Evaluate sanitized mathematical string
      let sanitized = display
        .replace(/π/g, 'Math.PI')
        .replace(/e/g, 'Math.E')
        .replace(/sin\(/g, isRad ? 'Math.sin(' : 'Math.sin(Math.PI/180*')
        .replace(/cos\(/g, isRad ? 'Math.cos(' : 'Math.cos(Math.PI/180*')
        .replace(/tan\(/g, isRad ? 'Math.tan(' : 'Math.tan(Math.PI/180*')
        .replace(/log\(/g, 'Math.log10(')
        .replace(/ln\(/g, 'Math.log(')
        .replace(/√\(/g, 'Math.sqrt(');

      const result = eval(sanitized);
      setDisplay(String(result));
    } catch (err) {
      setDisplay('Error');
    }
  };

  const handleFunc = (fn: string) => {
    setDisplay(prev => (prev === '0' ? `${fn}(` : `${prev}${fn}(`));
  };

  const handleFactorial = () => {
    try {
      const num = Number(display);
      if (isNaN(num) || num < 0) { setDisplay('Error'); return; }
      let fact = 1;
      for (let i = 2; i <= num; i++) fact *= i;
      setDisplay(String(fact));
    } catch {
      setDisplay('Error');
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 glass-panel rounded-xl shadow-2xl border border-indigo-500/30 overflow-hidden select-none">
      <div className="bg-slate-900/90 px-4 py-3 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center space-x-2 text-indigo-400 font-semibold text-sm">
          <Calculator className="w-4 h-4" />
          <span>GATE TCS Scientific Calculator</span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-3 bg-slate-950/80">
        {/* Display Screen */}
        <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-right">
          <div className="text-xs text-indigo-400 mb-1 flex justify-between font-mono">
            <span>{isRad ? 'RAD' : 'DEG'}</span>
            <span>M: {memory}</span>
          </div>
          <div className="text-2xl font-mono text-emerald-400 tracking-wider truncate">
            {display}
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="flex justify-between items-center text-xs">
          <button
            onClick={() => setIsRad(!isRad)}
            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
          >
            {isRad ? 'Switch to DEG' : 'Switch to RAD'}
          </button>
          <button onClick={handleClear} className="px-3 py-1 rounded bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 font-bold">
            C / Clear
          </button>
        </div>

        {/* Buttons Grid */}
        <div className="grid grid-cols-5 gap-1.5 text-xs font-medium">
          <button onClick={() => handleFunc('sin')} className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-indigo-300">sin</button>
          <button onClick={() => handleFunc('cos')} className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-indigo-300">cos</button>
          <button onClick={() => handleFunc('tan')} className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-indigo-300">tan</button>
          <button onClick={() => handleFunc('log')} className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-indigo-300">log</button>
          <button onClick={() => handleFunc('ln')} className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-indigo-300">ln</button>

          <button onClick={() => handleFunc('√')} className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-indigo-300">√</button>
          <button onClick={() => handleNum('(')} className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-indigo-300">(</button>
          <button onClick={() => handleNum(')')} className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-indigo-300">)</button>
          <button onClick={handleFactorial} className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-indigo-300">x!</button>
          <button onClick={() => handleOp('/')} className="p-2 bg-indigo-600/30 text-indigo-300 hover:bg-indigo-600/40 rounded">÷</button>

          <button onClick={() => handleNum('7')} className="p-2 bg-slate-900 hover:bg-slate-800 rounded">7</button>
          <button onClick={() => handleNum('8')} className="p-2 bg-slate-900 hover:bg-slate-800 rounded">8</button>
          <button onClick={() => handleNum('9')} className="p-2 bg-slate-900 hover:bg-slate-800 rounded">9</button>
          <button onClick={() => handleOp('*')} className="p-2 bg-indigo-600/30 text-indigo-300 hover:bg-indigo-600/40 rounded">×</button>
          <button onClick={() => handleNum('π')} className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-indigo-300">π</button>

          <button onClick={() => handleNum('4')} className="p-2 bg-slate-900 hover:bg-slate-800 rounded">4</button>
          <button onClick={() => handleNum('5')} className="p-2 bg-slate-900 hover:bg-slate-800 rounded">5</button>
          <button onClick={() => handleNum('6')} className="p-2 bg-slate-900 hover:bg-slate-800 rounded">6</button>
          <button onClick={() => handleOp('-')} className="p-2 bg-indigo-600/30 text-indigo-300 hover:bg-indigo-600/40 rounded">-</button>
          <button onClick={() => handleNum('e')} className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-indigo-300">e</button>

          <button onClick={() => handleNum('1')} className="p-2 bg-slate-900 hover:bg-slate-800 rounded">1</button>
          <button onClick={() => handleNum('2')} className="p-2 bg-slate-900 hover:bg-slate-800 rounded">2</button>
          <button onClick={() => handleNum('3')} className="p-2 bg-slate-900 hover:bg-slate-800 rounded">3</button>
          <button onClick={() => handleOp('+')} className="p-2 bg-indigo-600/30 text-indigo-300 hover:bg-indigo-600/40 rounded">+</button>
          <button onClick={handleCalculate} className="row-span-2 p-2 bg-emerald-600 hover:bg-emerald-500 rounded text-white font-bold text-base flex items-center justify-center">=</button>

          <button onClick={() => handleNum('0')} className="col-span-2 p-2 bg-slate-900 hover:bg-slate-800 rounded">0</button>
          <button onClick={() => handleNum('.')} className="p-2 bg-slate-900 hover:bg-slate-800 rounded">.</button>
        </div>
      </div>
    </div>
  );
};
