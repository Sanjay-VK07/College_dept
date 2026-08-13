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
    setDisplay((prev) => (prev === '0' ? n : prev + n));
  };

  const handleOp = (op: string) => {
    setDisplay((prev) => prev + ' ' + op + ' ');
  };

  const handleClear = () => setDisplay('0');

  const handleCalculate = () => {
    try {
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
    setDisplay((prev) => (prev === '0' ? `${fn}(` : `${prev}${fn}(`));
  };

  const handleFactorial = () => {
    try {
      const num = Number(display);
      if (isNaN(num) || num < 0) {
        setDisplay('Error');
        return;
      }
      let fact = 1;
      for (let i = 2; i <= num; i++) fact *= i;
      setDisplay(String(fact));
    } catch {
      setDisplay('Error');
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 bg-white rounded-lg shadow-xl border border-slate-300 overflow-hidden select-none font-sans">
      <div className="bg-[#1E40AF] text-white px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center space-x-2 font-semibold text-xs">
          <Calculator className="w-4 h-4 text-blue-200" />
          <span>Scientific Calculator</span>
        </div>
        <button onClick={onClose} className="text-blue-200 hover:text-white p-0.5">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-3 bg-slate-50">
        {/* Screen */}
        <div className="bg-white p-3 rounded border border-slate-300 text-right shadow-inner">
          <div className="text-[10px] text-slate-500 mb-1 flex justify-between font-mono">
            <span>MODE: {isRad ? 'RAD' : 'DEG'}</span>
            <span>MEM: {memory}</span>
          </div>
          <div className="text-xl font-mono text-slate-900 tracking-wider truncate font-bold">
            {display}
          </div>
        </div>

        {/* Mode Toggle & Clear */}
        <div className="flex justify-between items-center text-xs">
          <button
            onClick={() => setIsRad(!isRad)}
            className="px-2.5 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold border border-slate-300"
          >
            {isRad ? 'Switch to DEG' : 'Switch to RAD'}
          </button>
          <button
            onClick={handleClear}
            className="px-2.5 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 font-bold border border-red-300"
          >
            Clear (C)
          </button>
        </div>

        {/* Keypad Grid */}
        <div className="grid grid-cols-5 gap-1.5 text-xs font-semibold">
          <button onClick={() => handleFunc('sin')} className="p-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#1E40AF] rounded">sin</button>
          <button onClick={() => handleFunc('cos')} className="p-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#1E40AF] rounded">cos</button>
          <button onClick={() => handleFunc('tan')} className="p-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#1E40AF] rounded">tan</button>
          <button onClick={() => handleFunc('log')} className="p-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#1E40AF] rounded">log</button>
          <button onClick={() => handleFunc('ln')} className="p-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#1E40AF] rounded">ln</button>

          <button onClick={() => handleFunc('√')} className="p-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#1E40AF] rounded">√</button>
          <button onClick={() => handleNum('(')} className="p-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#1E40AF] rounded">(</button>
          <button onClick={() => handleNum(')')} className="p-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#1E40AF] rounded">)</button>
          <button onClick={handleFactorial} className="p-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#1E40AF] rounded">x!</button>
          <button onClick={() => handleOp('/')} className="p-2 bg-blue-50 hover:bg-blue-100 text-[#1E40AF] border border-blue-200 rounded font-bold">÷</button>

          <button onClick={() => handleNum('7')} className="p-2 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-900">7</button>
          <button onClick={() => handleNum('8')} className="p-2 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-900">8</button>
          <button onClick={() => handleNum('9')} className="p-2 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-900">9</button>
          <button onClick={() => handleOp('*')} className="p-2 bg-blue-50 hover:bg-blue-100 text-[#1E40AF] border border-blue-200 rounded font-bold">×</button>
          <button onClick={() => handleNum('π')} className="p-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#1E40AF] rounded">π</button>

          <button onClick={() => handleNum('4')} className="p-2 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-900">4</button>
          <button onClick={() => handleNum('5')} className="p-2 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-900">5</button>
          <button onClick={() => handleNum('6')} className="p-2 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-900">6</button>
          <button onClick={() => handleOp('-')} className="p-2 bg-blue-50 hover:bg-blue-100 text-[#1E40AF] border border-blue-200 rounded font-bold">-</button>
          <button onClick={() => handleNum('e')} className="p-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#1E40AF] rounded">e</button>

          <button onClick={() => handleNum('1')} className="p-2 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-900">1</button>
          <button onClick={() => handleNum('2')} className="p-2 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-900">2</button>
          <button onClick={() => handleNum('3')} className="p-2 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-900">3</button>
          <button onClick={() => handleOp('+')} className="p-2 bg-blue-50 hover:bg-blue-100 text-[#1E40AF] border border-blue-200 rounded font-bold">+</button>
          <button onClick={handleCalculate} className="row-span-2 p-2 bg-[#1E40AF] hover:bg-[#1D4ED8] text-white font-bold rounded flex items-center justify-center text-lg">=</button>

          <button onClick={() => handleNum('0')} className="col-span-2 p-2 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-900">0</button>
          <button onClick={() => handleNum('.')} className="p-2 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-900">.</button>
        </div>
      </div>
    </div>
  );
};
