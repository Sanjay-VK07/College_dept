import { prisma } from '../../../config/prisma';

export interface QuestionPerformanceMetrics {
  questionId: string;
  stem: string;
  type: string;
  difficulty: string;
  attemptCount: number;
  correctCount: number;
  incorrectCount: number;
  skippedCount: number;
  accuracyPercentage: number;
  averageTimeSpentSec: number;
  marks: number;
}

export class QuestionIntelligenceService {
  /**
   * Aggregates real student response data from PostgreSQL for a specific Question.
   */
  public static async getQuestionPerformance(questionId: string): Promise<QuestionPerformanceMetrics | null> {
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      select: { id: true, text: true, type: true, difficulty: true, marks: true },
    });

    if (!question) return null;

    const responses = await prisma.questionResponse.findMany({
      where: { questionId },
      select: { status: true, isCorrect: true, timeSpentSec: true },
    });

    if (responses.length === 0) {
      return {
        questionId: question.id,
        stem: question.text,
        type: question.type,
        difficulty: question.difficulty,
        attemptCount: 0,
        correctCount: 0,
        incorrectCount: 0,
        skippedCount: 0,
        accuracyPercentage: 0,
        averageTimeSpentSec: 0,
        marks: question.marks,
      };
    }

    const answered = responses.filter((r) => r.status === 'ANSWERED' || r.status === 'ANSWERED_AND_MARKED');
    const skipped = responses.filter((r) => r.status === 'SKIPPED' || r.status === 'NOT_VISITED');

    const correctCount = answered.filter((r) => r.isCorrect).length;
    const incorrectCount = answered.length - correctCount;
    const totalAttempts = answered.length;

    const accuracyPercentage = totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 1000) / 10 : 0;

    const totalTime = responses.reduce((acc, r) => acc + (r.timeSpentSec || 0), 0);
    const averageTimeSpentSec = responses.length > 0 ? Math.round(totalTime / responses.length) : 0;

    return {
      questionId: question.id,
      stem: question.text,
      type: question.type,
      difficulty: question.difficulty,
      attemptCount: totalAttempts,
      correctCount,
      incorrectCount,
      skippedCount: skipped.length,
      accuracyPercentage,
      averageTimeSpentSec,
      marks: question.marks,
    };
  }

  /**
   * Returns performance aggregate metrics across all attempted Question Bank questions.
   */
  public static async getAllQuestionPerformance() {
    const questions = await prisma.question.findMany({
      select: {
        id: true,
        text: true,
        type: true,
        difficulty: true,
        marks: true,
        responses: {
          select: { status: true, isCorrect: true, timeSpentSec: true },
        },
      },
    });

    return questions.map((q) => {
      const answered = q.responses.filter((r) => r.status === 'ANSWERED' || r.status === 'ANSWERED_AND_MARKED');
      const skipped = q.responses.filter((r) => r.status === 'SKIPPED' || r.status === 'NOT_VISITED');
      const correctCount = answered.filter((r) => r.isCorrect).length;
      const totalAttempts = answered.length;
      const accuracy = totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 1000) / 10 : 0;
      const totalTime = q.responses.reduce((acc, r) => acc + (r.timeSpentSec || 0), 0);
      const avgTime = q.responses.length > 0 ? Math.round(totalTime / q.responses.length) : 0;

      return {
        questionId: q.id,
        stem: q.text,
        type: q.type,
        difficulty: q.difficulty,
        attemptCount: totalAttempts,
        correctCount,
        incorrectCount: totalAttempts - correctCount,
        skippedCount: skipped.length,
        accuracyPercentage: accuracy,
        averageTimeSpentSec: avgTime,
        marks: q.marks,
      };
    });
  }
}
