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
    if (chosenAnswer === undefined || chosenAnswer === null || chosenAnswer === '') {
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
    const correctLetter = this.normalizeOptionToLetter(question.correctAnswer);

    if (chosenLetter && correctLetter && chosenLetter === correctLetter) {
      return { isCorrect: true, marksObtained: question.marks };
    } else {
      // Negative marking ONLY applies to MCQ: 1/3 penalty for 1-mark, 2/3 penalty for 2-mark
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

    let min: number | undefined;
    let max: number | undefined;
    let targetVal: number | undefined;

    const ca = question.correctAnswer;
    if (typeof ca === 'number') {
      targetVal = ca;
    } else if (typeof ca === 'string') {
      const trimmed = ca.trim();
      const rangeMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*(?::|to|-)\s*(-?\d+(?:\.\d+)?)$/i);
      if (rangeMatch) {
        min = parseFloat(rangeMatch[1]);
        max = parseFloat(rangeMatch[2]);
      } else {
        const parsed = parseFloat(trimmed);
        if (!isNaN(parsed)) targetVal = parsed;
      }
    } else if (typeof ca === 'object' && ca !== null) {
      if (ca.min !== undefined && ca.max !== undefined) {
        min = Number(ca.min);
        max = Number(ca.max);
      } else if (ca.range) {
        if (Array.isArray(ca.range) && ca.range.length >= 2) {
          min = Number(ca.range[0]);
          max = Number(ca.range[1]);
        } else if (typeof ca.range === 'object' && ca.range.from !== undefined && ca.range.to !== undefined) {
          min = Number(ca.range.from);
          max = Number(ca.range.to);
        }
      }
      if (ca.value !== undefined) {
        targetVal = Number(ca.value);
      }
    }

    let isCorrect = false;
    if (min !== undefined && max !== undefined && !isNaN(min) && !isNaN(max)) {
      const lower = Math.min(min, max);
      const upper = Math.max(min, max);
      isCorrect = numValue >= (lower - 0.001) && numValue <= (upper + 0.001);
    } else if (targetVal !== undefined && !isNaN(targetVal)) {
      isCorrect = Math.abs(numValue - targetVal) < 0.001;
    }

    if (isCorrect) {
      return { isCorrect: true, marksObtained: question.marks };
    } else {
      return { isCorrect: false, marksObtained: 0 }; // Zero negative marks for NAT
    }
  }
}
