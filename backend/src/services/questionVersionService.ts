import { prisma } from '../config/prisma';
import { Question } from '@prisma/client';

/**
 * Manages immutable snapshots of a Question's gradable content (text/options/correctAnswer/
 * marks/negativeMarks/explanation/imageUrl). Every edit that touches these fields must go
 * through snapshotNewVersion() so that exams already pointing at an older version (via
 * MockTestQuestion.questionVersionId) keep scoring against what the student actually saw,
 * regardless of later edits or AI-solution approvals.
 */
export class QuestionVersionService {
  public static async createInitialVersion(question: Question) {
    return prisma.questionVersion.create({
      data: {
        questionId: question.id,
        versionNumber: 1,
        text: question.text,
        type: question.type,
        difficulty: question.difficulty,
        marks: question.marks,
        negativeMarks: question.negativeMarks,
        options: question.options as any,
        correctAnswer: question.correctAnswer as any,
        explanation: question.explanation,
        imageUrl: question.imageUrl,
      },
    });
  }

  /**
   * Snapshots the question's CURRENT (pre-update) state as a new version and returns the next
   * version number. Call this immediately before applying an update that touches gradable
   * fields, and include `{ currentVersion: nextVersion }` in that same update — ideally within
   * one transaction alongside the snapshot write (see solutionService.approveSolution for the
   * reference pattern) so the version bump and the field change land atomically.
   */
  public static async snapshotNewVersion(
    questionId: string,
    createdById?: string,
    tx: Pick<typeof prisma, 'question' | 'questionVersion'> = prisma
  ): Promise<{ nextVersion: number }> {
    const question = await tx.question.findUnique({ where: { id: questionId } });
    if (!question) {
      throw new Error(`Cannot version question ${questionId}: not found.`);
    }

    const nextVersion = question.currentVersion + 1;

    await tx.questionVersion.create({
      data: {
        questionId: question.id,
        versionNumber: nextVersion,
        text: question.text,
        type: question.type,
        difficulty: question.difficulty,
        marks: question.marks,
        negativeMarks: question.negativeMarks,
        options: question.options as any,
        correctAnswer: question.correctAnswer as any,
        explanation: question.explanation,
        imageUrl: question.imageUrl,
        createdById: createdById || null,
      },
    });

    return { nextVersion };
  }

  /**
   * Resolves the QuestionVersion id that should be pinned on a new MockTestQuestion row at
   * exam-assembly/attach time (creating v1 first if the question predates versioning).
   */
  public static async getCurrentVersionId(questionId: string): Promise<string> {
    const question = await prisma.question.findUnique({ where: { id: questionId } });
    if (!question) {
      throw new Error(`Cannot resolve version for question ${questionId}: not found.`);
    }

    const existing = await prisma.questionVersion.findUnique({
      where: { questionId_versionNumber: { questionId, versionNumber: question.currentVersion } },
    });
    if (existing) return existing.id;

    const created = await this.createInitialVersion(question);
    return created.id;
  }
}
