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
    // chosenAnswer expected to be index number or array with 1 index e.g. 2 or [2]
    const chosenIndex = Array.isArray(chosenAnswer) ? chosenAnswer[0] : Number(chosenAnswer);
    const correctIndices = Array.isArray(question.correctAnswer) ? question.correctAnswer : [question.correctAnswer];
    const correctIndex = Number(correctIndices[0]);

    if (chosenIndex === correctIndex) {
      return { isCorrect: true, marksObtained: question.marks };
    } else {
      // Negative marking ONLY applies to MCQ
      const penalty = question.negativeMarks || (question.marks === 2.0 ? 0.67 : 0.33);
      return { isCorrect: false, marksObtained: -Math.abs(penalty) };
    }
  }

  private static evaluateMSQ(question: QuestionData, chosenAnswer: any): EvaluationResult {
    // MSQ requires exact match of set of correct indices, with NO negative marks
    const chosenIndices = (Array.isArray(chosenAnswer) ? chosenAnswer : [chosenAnswer]).map(Number).sort((a, b) => a - b);
    const correctIndices = (Array.isArray(question.correctAnswer) ? question.correctAnswer : [question.correctAnswer]).map(Number).sort((a, b) => a - b);

    if (chosenIndices.length !== correctIndices.length) {
      return { isCorrect: false, marksObtained: 0 };
    }

    const isMatch = chosenIndices.every((val, idx) => val === correctIndices[idx]);
    if (isMatch) {
      return { isCorrect: true, marksObtained: question.marks };
    } else {
      return { isCorrect: false, marksObtained: 0 }; // Zero negative marks for MSQ
    }
  }

  private static evaluateNAT(question: QuestionData, chosenAnswer: any): EvaluationResult {
    // NAT accepts numerical values, either exact or within tolerance range { min, max, value }
    const numValue = Number(chosenAnswer);
    if (isNaN(numValue)) {
      return { isCorrect: false, marksObtained: 0 };
    }

    const answerConfig = question.correctAnswer as { min?: number; max?: number; value?: number };

    let isCorrect = false;
    if (answerConfig.min !== undefined && answerConfig.max !== undefined) {
      isCorrect = numValue >= answerConfig.min && numValue <= answerConfig.max;
    } else if (answerConfig.value !== undefined) {
      isCorrect = Math.abs(numValue - answerConfig.value) < 0.001;
    } else if (typeof question.correctAnswer === 'number') {
      isCorrect = Math.abs(numValue - question.correctAnswer) < 0.001;
    }

    if (isCorrect) {
      return { isCorrect: true, marksObtained: question.marks };
    } else {
      return { isCorrect: false, marksObtained: 0 }; // Zero negative marks for NAT
    }
  }
}
