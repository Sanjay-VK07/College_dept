import { QuestionType } from '@prisma/client';

export interface QuestionData {
  id: string;
  type: QuestionType;
  marks: number;
  negativeMarks: number;
  correctAnswer: any; // MCQ: [index], MSQ: [indices], NAT: { min, max, value }
}

export interface EvaluationResult {
  isCorrect: boolean;
  marksObtained: number;
}

export class GateScoringService {
  /**
   * Normalizes an option index (0, 1, 2) or option letter ('A', 'B', 'C') or string representation to a single uppercase letter.
   */
  public static normalizeOptionToLetter(val: any): string | null {
    if (val === undefined || val === null || val === '') return null;
    if (Array.isArray(val)) {
      return val.length > 0 ? this.normalizeOptionToLetter(val[0]) : null;
    }
    if (typeof val === 'object' && val !== null && 'value' in val) {
      return this.normalizeOptionToLetter(val.value);
    }
    if (typeof val === 'number') {
      if (val >= 0 && val < 26) {
        return String.fromCharCode(65 + val);
      }
      return String(val);
    }
    const str = String(val).trim().toUpperCase();
    if (/^[0-9]+$/.test(str)) {
      const num = parseInt(str, 10);
      if (num >= 0 && num < 26) {
        return String.fromCharCode(65 + num);
      }
    }
    // Handle True/False boolean questions (e.g. True -> A, False -> B)
    if (str === 'TRUE') return 'A';
    if (str === 'FALSE') return 'B';

    const match = str.match(/[A-Z]/);
    if (match) return match[0];
    return str;
  }

  /**
   * Normalizes an array, comma/semicolon delimited string, or set of options to a sorted array of uppercase letters.
   */
  public static normalizeOptionsList(val: any): string[] {
    if (val === undefined || val === null || val === '') return [];
    let items: any[] = [];
    if (Array.isArray(val)) {
      items = val;
    } else if (typeof val === 'string') {
      if (val.includes(';') || val.includes(',') || val.includes(' ')) {
        items = val.split(/[;,\s]+/);
      } else {
        items = [val];
      }
    } else {
      items = [val];
    }

    const normalized = items
      .map(item => this.normalizeOptionToLetter(item))
      .filter((k): k is string => k !== null);

    return Array.from(new Set(normalized)).sort();
  }

  /**
   * Evaluates a student response against GATE official marking rules
   */
  public static evaluateResponse(question: QuestionData, chosenAnswer: any): EvaluationResult {
    if (
      chosenAnswer === undefined ||
      chosenAnswer === null ||
      chosenAnswer === '' ||
      (Array.isArray(chosenAnswer) && chosenAnswer.length === 0)
    ) {
      return { isCorrect: false, marksObtained: 0 };
    }

    switch (question.type) {
      case QuestionType.MCQ:
        return this.evaluateMCQ(question, chosenAnswer);
      case QuestionType.MSQ:
        return this.evaluateMSQ(question, chosenAnswer);
      case QuestionType.NAT:
        return this.evaluateNAT(question, chosenAnswer);
      default:
        return { isCorrect: false, marksObtained: 0 };
    }
  }

  private static evaluateMCQ(question: QuestionData, chosenAnswer: any): EvaluationResult {
    const chosenLetter = this.normalizeOptionToLetter(chosenAnswer);
    if (!chosenLetter) {
      return { isCorrect: false, marksObtained: 0 };
    }

    const correctLetter = this.normalizeOptionToLetter(question.correctAnswer);

    if (correctLetter && chosenLetter === correctLetter) {
      return { isCorrect: true, marksObtained: question.marks };
    } else {
      // Negative marking ONLY applies to MCQ when candidate selected an incorrect option
      const penalty = question.negativeMarks || (question.marks === 2.0 ? 0.67 : 0.33);
      return { isCorrect: false, marksObtained: -Math.abs(penalty) };
    }
  }

  private static evaluateMSQ(question: QuestionData, chosenAnswer: any): EvaluationResult {
    // MSQ requires exact match of set of correct indices, with NO negative marks
    const chosenList = this.normalizeOptionsList(chosenAnswer);
    const correctList = this.normalizeOptionsList(question.correctAnswer);

    if (chosenList.length === 0 || chosenList.length !== correctList.length) {
      return { isCorrect: false, marksObtained: 0 };
    }

    const isMatch = chosenList.every((val, idx) => val === correctList[idx]);
    if (isMatch) {
      return { isCorrect: true, marksObtained: question.marks };
    } else {
      return { isCorrect: false, marksObtained: 0 }; // Zero negative marks for MSQ
    }
  }

  private static evaluateNAT(question: QuestionData, chosenAnswer: any): EvaluationResult {
    // NAT accepts numerical values, either exact or within tolerance range { min, max, value }
    let numValue: number | null = null;
    if (typeof chosenAnswer === 'number') {
      numValue = chosenAnswer;
    } else if (typeof chosenAnswer === 'string') {
      const trimmed = chosenAnswer.trim();
      if (trimmed !== '') {
        const parsed = parseFloat(trimmed);
        if (!isNaN(parsed)) numValue = parsed;
      }
    } else if (typeof chosenAnswer === 'object' && chosenAnswer !== null && 'value' in chosenAnswer) {
      const parsed = parseFloat(String(chosenAnswer.value));
      if (!isNaN(parsed)) numValue = parsed;
    }

    if (numValue === null || isNaN(numValue)) {
      return { isCorrect: false, marksObtained: 0 };
    }

    const ca = question.correctAnswer;
    if (ca === undefined || ca === null) {
      return { isCorrect: false, marksObtained: 0 };
    }

    // Helper to evaluate a single candidate range or scalar against numValue
    const matchesCandidate = (candidate: any): boolean => {
      if (candidate === undefined || candidate === null) return false;
      const EPS = 1e-6;

      if (typeof candidate === 'number') {
        return Math.abs(numValue - candidate) < EPS;
      }
      if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (trimmed.includes(';')) {
          return trimmed.split(';').some((seg) => matchesCandidate(seg.trim()));
        }
        const rangeMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*(?::|\bto\b|-|~)\s*(-?\d+(?:\.\d+)?)$/i);
        if (rangeMatch) {
          const lower = Math.min(parseFloat(rangeMatch[1]), parseFloat(rangeMatch[2]));
          const upper = Math.max(parseFloat(rangeMatch[1]), parseFloat(rangeMatch[2]));
          return numValue >= lower - EPS && numValue <= upper + EPS;
        }
        const parsed = parseFloat(trimmed);
        if (!isNaN(parsed)) {
          return Math.abs(numValue - parsed) < EPS;
        }
        return false;
      }
      if (typeof candidate === 'object' && candidate !== null) {
        if (Array.isArray(candidate.acceptedRanges) && candidate.acceptedRanges.length > 0) {
          return candidate.acceptedRanges.some((r: any) => matchesCandidate(r));
        }
        let min = candidate.min !== undefined ? Number(candidate.min) : undefined;
        let max = candidate.max !== undefined ? Number(candidate.max) : undefined;
        if (candidate.range) {
          if (Array.isArray(candidate.range) && candidate.range.length >= 2) {
            if (min === undefined) min = Number(candidate.range[0]);
            if (max === undefined) max = Number(candidate.range[1]);
          } else if (typeof candidate.range === 'object') {
            if (min === undefined && candidate.range.from !== undefined) min = Number(candidate.range.from);
            if (max === undefined && candidate.range.to !== undefined) max = Number(candidate.range.to);
          }
        }
        if (min !== undefined && max !== undefined && !isNaN(min) && !isNaN(max)) {
          const lower = Math.min(min, max);
          const upper = Math.max(min, max);
          return numValue >= lower - EPS && numValue <= upper + EPS;
        }
        if (candidate.value !== undefined) {
          const target = Number(candidate.value);
          if (!isNaN(target)) {
            const tol = typeof candidate.tolerance === 'number' ? candidate.tolerance : EPS;
            return Math.abs(numValue - target) <= tol;
          }
        }
      }
      return false;
    };

    let isCorrect = false;
    if (Array.isArray(ca)) {
      isCorrect = ca.some((item) => matchesCandidate(item));
    } else {
      isCorrect = matchesCandidate(ca);
    }

    if (isCorrect) {
      return { isCorrect: true, marksObtained: question.marks };
    } else {
      return { isCorrect: false, marksObtained: 0 }; // Zero negative marks for NAT
    }
  }
}
