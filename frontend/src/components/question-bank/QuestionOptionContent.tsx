'use client';

import React from 'react';
import { Maximize2 } from 'lucide-react';
import { QuestionOption } from '@/types/question';

export function getOptionText(option: QuestionOption): string {
  if (option === null || option === undefined) return '';
  let raw = '';
  if (typeof option === 'string') raw = option;
  else if (typeof option === 'number' || typeof option === 'boolean') raw = String(option);
  else if (typeof option === 'object') {
    if (typeof option.text === 'string') raw = option.text;
    else if (typeof option.text === 'object' && option.text !== null) {
      raw = getOptionText(option.text as any);
    } else if (typeof option.label === 'string') raw = option.label;
    else if (typeof option.value === 'string' && !option.imagePath && !option.imageUrl && !option.image) {
      raw = option.value;
    }
  }
  if (!raw) return '';

  // Clean leading A., B., C., D., (A), (B), (C), (D), A), B), C), D) prefixes
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^(?:[A-D][\.\:\)]|\([A-D]\))\s*/i, '');

  // If the cleaned text is just the option letter itself (e.g. 'A' or 'Option A'), return empty so badge alone renders
  if (/^(?:[A-D]|Option\s+[A-D])$/i.test(cleaned)) {
    return '';
  }
  return cleaned;
}

export function getOptionImage(option: QuestionOption): string | null {
  if (option && typeof option === 'object') {
    const url = option.imagePath || option.imageUrl || option.image;
    if (typeof url === 'string' && url.trim().length > 0) {
      return url.trim();
    }
  }
  return null;
}

export interface QuestionOptionContentProps {
  option: QuestionOption;
  optionIndex?: number;
  isSelected?: boolean;
  isCorrect?: boolean;
  onZoomImage?: (url: string, title?: string) => void;
  className?: string;
  textClassName?: string;
  imageClassName?: string;
}

export const QuestionOptionContent: React.FC<QuestionOptionContentProps> = ({
  option,
  optionIndex,
  isSelected,
  isCorrect,
  onZoomImage,
  className = '',
  textClassName = '',
  imageClassName = '',
}) => {
  const text = getOptionText(option);
  const imageUrl = getOptionImage(option);
  const hasText = !!(text && text.trim());
  const hasImage = !!imageUrl;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {hasText && (
        <span className={`leading-relaxed whitespace-pre-wrap ${textClassName}`}>
          {text}
        </span>
      )}

      {hasImage && (
        <div className="relative group inline-block max-w-full">
          <img
            src={imageUrl!}
            alt={hasText ? text : `Option ${optionIndex !== undefined ? String.fromCharCode(65 + optionIndex) : ''}`}
            className={`max-h-48 w-auto object-contain rounded border border-slate-200 cursor-zoom-in bg-white p-1 hover:border-blue-400 transition-all ${imageClassName}`}
            onClick={(e) => {
              e.stopPropagation();
              if (onZoomImage) {
                onZoomImage(
                  imageUrl!,
                  `Option ${optionIndex !== undefined ? String.fromCharCode(65 + optionIndex) : ''} Image`
                );
              }
            }}
          />
          {onZoomImage && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onZoomImage(
                  imageUrl!,
                  `Option ${optionIndex !== undefined ? String.fromCharCode(65 + optionIndex) : ''} Image`
                );
              }}
              className="absolute top-1 right-1 px-1.5 py-0.5 bg-slate-900/80 hover:bg-slate-900 text-white rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shadow"
              title="Click to Zoom Image"
            >
              <Maximize2 className="w-3 h-3" />
              <span>Zoom</span>
            </button>
          )}
        </div>
      )}

      {!hasText && !hasImage && (
        <span className="text-xs text-slate-400 italic">(Empty Option)</span>
      )}
    </div>
  );
};
