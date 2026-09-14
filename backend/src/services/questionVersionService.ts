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
   * Creates the version row for a question's NEW (post-update) state and returns its version
   * number. `updatedFields` is whatever the caller is about to change (e.g. `correctAnswer`,
   * `explanation`); any gradable field not included keeps its current value. Call this instead
   * of writing the update directly, then apply the SAME `updatedFields` to the live `Question`
   * row (together with `{ currentVersion: nextVersion }`) in the same transaction — see
   * solutionService.approveSolution for the reference pattern.
   *
   * This must build the version row from the MERGED (new) state, not the pre-update state:
   * getCurrentVersionId() looks up a QuestionVersion by `versionNumber === question.currentVersion`
   * expecting to find the content that is *currently* live. An earlier version of this function
   * snapshotted the OLD content under the NEW version number — every question corrected through
   * this path (including a real, confirmed case: 26 NAT questions whose answer-key parsing was
   * fixed) ended up with any newly-attached exam frozen to the answer from *before* the fix,
   * silently re-introducing the exact bug the correction was meant to resolve.
   */
  public static async snapshotNewVersion(
    questionId: string,
    updatedFields: Partial<
      Pick<Question, 'text' | 'type' | 'difficulty' | 'marks' | 'negativeMarks' | 'options' | 'correctAnswer' | 'explanation' | 'imageUrl'>
    >,
    createdById?: string,
    tx: Pick<typeof prisma, 'question' | 'questionVersion'> = prisma
  ): Promise<{ nextVersion: number }> {
    const question = await tx.question.findUnique({ where: { id: questionId } });
    if (!question) {
      throw new Error(`Cannot version question ${questionId}: not found.`);
    }

    const nextVersion = question.currentVersion + 1;
    const merged = { ...question, ...updatedFields };

    await tx.questionVersion.create({
      data: {
        questionId: question.id,
        versionNumber: nextVersion,
        text: merged.text,
        type: merged.type,
        difficulty: merged.difficulty,
        marks: merged.marks,
        negativeMarks: merged.negativeMarks,
        options: merged.options as any,
        correctAnswer: merged.correctAnswer as any,
        explanation: merged.explanation,
        imageUrl: merged.imageUrl,
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
