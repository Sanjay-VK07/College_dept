'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, X, BookOpen } from 'lucide-react';

export interface SubjectOption {
  id: string;
  name: string;
  code?: string;
  department?: string;
}

interface SearchableSubjectSelectProps {
  subjects: SubjectOption[];
  value: string;
  onChange: (id: string, subject?: SubjectOption) => void;
  placeholder?: string;
  includeAllOption?: boolean;
  allOptionLabel?: string;
  className?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export const SearchableSubjectSelect: React.FC<SearchableSubjectSelectProps> = ({
  subjects,
  value,
  onChange,
  placeholder = 'Select subject...',
  includeAllOption = false,
  allOptionLabel = 'All Subjects',
  className = '',
  disabled = false,
  size = 'md',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const selectedSubject = subjects.find((s) => s.id === value);
  const isAllSelected = includeAllOption && (value === 'ALL' || !value);

  const query = searchQuery.trim().toLowerCase();
  const filteredSubjects = subjects.filter((s) => {
    if (!query) return true;
    const matchName = s.name.toLowerCase().includes(query);
    const matchCode = s.code?.toLowerCase().includes(query);
    const matchDept = s.department?.toLowerCase().includes(query);
    return matchName || matchCode || matchDept;
  });

  const handleSelect = (id: string, subject?: SubjectOption) => {
    onChange(id, subject);
    setIsOpen(false);
  };

  const isSm = size === 'sm';

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-2 text-left bg-white border border-slate-300 rounded-md transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed ${
          isSm ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-xs sm:text-sm'
        }`}
      >
        <div className="flex items-center gap-2 truncate flex-1 min-w-0">
          <BookOpen className={`shrink-0 text-slate-400 ${isSm ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
          {isAllSelected ? (
            <span className="font-semibold text-slate-900 truncate">{allOptionLabel}</span>
          ) : selectedSubject ? (
            <div className="flex items-center gap-2 truncate">
              <span className="font-bold text-slate-900 truncate">{selectedSubject.name}</span>
              {selectedSubject.code && (
                <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                  {selectedSubject.code}
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-400 truncate">{placeholder}</span>
          )}
        </div>
        <ChevronDown
          className={`shrink-0 text-slate-400 transition-transform duration-200 ${isSm ? 'w-3.5 h-3.5' : 'w-4 h-4'} ${
            isOpen ? 'rotate-180 text-emerald-700' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full min-w-[280px] sm:min-w-[340px] max-w-[420px] bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden animate-in fade-in-50 duration-100 left-0">
          <div className="p-2 border-b border-slate-100 bg-slate-50/80 sticky top-0 z-10">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search subject by name or code..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 placeholder-slate-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
            {includeAllOption && !query && (
              <button
                type="button"
                onClick={() => handleSelect('ALL')}
                className={`w-full text-left px-3 py-2 flex items-center justify-between text-xs hover:bg-slate-50 transition-colors ${
                  value === 'ALL' || !value ? 'bg-emerald-50 text-emerald-900 font-semibold' : 'text-slate-700'
                }`}
              >
                <span>{allOptionLabel}</span>
                {(value === 'ALL' || !value) && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
              </button>
            )}

            {filteredSubjects.length === 0 ? (
              <div className="px-4 py-5 text-center text-xs text-slate-500">
                No subjects matching <span className="font-semibold text-slate-800">"{searchQuery}"</span>
              </div>
            ) : (
              filteredSubjects.map((s) => {
                const isSelected = s.id === value;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelect(s.id, s)}
                    className={`w-full text-left px-3 py-2.5 flex items-center justify-between text-xs hover:bg-emerald-50/60 transition-colors ${
                      isSelected ? 'bg-emerald-50 text-emerald-950 font-bold' : 'text-slate-800'
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="font-bold text-slate-900 truncate">{s.name}</div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500 font-mono">
                        {s.code && <span>Code: {s.code}</span>}
                        {s.department && <span>• {s.department}</span>}
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500 flex justify-between items-center">
            <span>
              Showing {filteredSubjects.length} of {subjects.length} subjects
            </span>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-emerald-700 hover:underline"
              >
                Reset search
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
