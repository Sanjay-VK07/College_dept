/**
 * Canonical GATE Marks Formatter
 * Strictly adheres to official GATE examination scoring display guidelines:
 * - Marks allotted: "1 mark" or "2 marks"
 * - Marks obtained: "+1.00 marks", "+2.00 marks", "-0.33 marks", "-0.66 marks", "0.00 marks"
 * - Negative marks deducted: "0.33 marks", "0.66 marks", "0.00 marks"
 * Never displays ambiguous shorthand like "0.33 m" or "1m".
 */

export function formatMarksAllotted(marks: number | undefined | null): string {
  const m = Number(marks || 1);
  return `${m} mark${m === 1 ? '' : 's'}`;
}

export function formatNegativeDeduction(marks: number | undefined | null, type?: string): string {
  const qType = String(type || 'MCQ').toUpperCase();
  if (qType === 'MSQ' || qType === 'NAT') {
    return '0.00 marks (No negative marking)';
  }
  const m = Number(marks || 1);
  const deduction = m === 2 ? 0.66 : 0.33;
  return `${deduction.toFixed(2)} marks`;
}

export function formatMarksObtained(
  marksObtained: number | undefined | null,
  isCorrect?: boolean,
  isAttempted?: boolean,
  type?: string
): { text: string; signedValue: string; colorClass: string; isNegative: boolean } {
  if (isAttempted === false || marksObtained === undefined || marksObtained === null) {
    return {
      text: '0.00 marks',
      signedValue: '0.00',
      colorClass: 'text-slate-600',
      isNegative: false,
    };
  }

  const val = Number(marksObtained);
  if (isCorrect || val > 0) {
    const formatted = `+${Math.abs(val).toFixed(2)} marks`;
    return {
      text: formatted,
      signedValue: `+${Math.abs(val).toFixed(2)}`,
      colorClass: 'text-emerald-700',
      isNegative: false,
    };
  }

  if (val < 0) {
    const formatted = `-${Math.abs(val).toFixed(2)} marks`;
    return {
      text: formatted,
      signedValue: `-${Math.abs(val).toFixed(2)}`,
      colorClass: 'text-rose-600 font-bold',
      isNegative: true,
    };
  }

  return {
    text: '0.00 marks',
    signedValue: '0.00',
    colorClass: 'text-slate-600',
    isNegative: false,
  };
}
