import { prisma } from '../../../config/prisma';
import { Role, Difficulty, QuestionType } from '@prisma/client';
import { RAGService } from './ragService';
import { LLMFactory } from './llmProvider';
import { AuditLogger } from '../../../services/auditLogger';

export interface GeneratePracticeSetParams {
  subject: string;
  topic: string;
  difficulty: Difficulty;
  count: number;
  userId: string;
}

export interface SubmitPracticeParams {
  subject: string;
  topic: string;
  difficulty: Difficulty;
  questions: any[];
  answers: any[]; // Chosen answer indices (e.g. 0 to 3) or numerical value string
  userId: string;
}

export class PracticeService {
  /**
   * Generates a practice question set for a student from public study materials.
   */
  public static async generatePracticeSet(params: GeneratePracticeSetParams): Promise<any[]> {
    const { subject, topic, difficulty, count, userId } = params;

    if (count <= 0 || count > 10) {
      throw new Error('You can generate between 1 and 10 practice questions.');
    }

    // 1. Retrieve authorized study material chunks
    const chunks = await RAGService.searchChunks({
      query: `${subject} ${topic}`,
      userId,
      role: Role.STUDENT, // Strictly scoped to STUDENT level visibility
      limit: 6,
    });

    const contextText = chunks.map((c) => `[DOCUMENT CONTEXT]:\n${c.content}`).join('\n\n');

    // 2. Instruct LLM to generate practice questions
    const systemPrompt = `
SYSTEM INSTRUCTIONS:
You are the GSMAS AI Student Study Coach.
Generate exactly ${count} practice questions for a student preparing for examinations.
Subject: "${subject}"
Topic: "${topic}"
Difficulty: ${difficulty}

${contextText ? 'Use this study material as context:\n' + contextText : 'Use general GATE examination syllabus knowledge.'}

Return ONLY a valid JSON array of question objects matching the schemas below. Do not output markdown, fences, or text.

SCHEMAS:
[{
  "id": "practice-1",
  "question": "Question text here...",
  "type": "MCQ", // Can be "MCQ" or "NAT"
  "options": ["Option A", "Option B", "Option C", "Option D"], // Only for MCQ. Omit for NAT.
  "correctAnswer": 2, // For MCQ: Integer index (0 to 3) of correct option. For NAT: Numeric correct answer (e.g. 15.5)
  "tolerance": 0.05, // Only for NAT: Numeric range tolerance (default 0)
  "explanation": "Detailed explanation of correct answer...",
  "source": "Title of document or General Study Material"
}]
`;

    const llm = LLMFactory.getProvider();
    const resultText = await llm.generate(systemPrompt, [], `Generate ${count} practice questions.`);

    let cleanJson = resultText.trim();
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }

    let questions: any[];
    try {
      questions = JSON.parse(cleanJson);
      if (!Array.isArray(questions)) {
        throw new Error('LLM output is not an array.');
      }
    } catch (parseErr) {
      console.error('[PracticeService Parse Error]:', resultText);
      throw new Error('Failed to generate practice set. Please try again.');
    }

    // Audit Log Practice Started
    await AuditLogger.log({
      userId,
      action: 'AI_PRACTICE_STARTED',
      resource: 'AIPracticeAttempt',
      details: `Generated practice set of ${questions.length} questions on ${subject} - ${topic}`,
    });

    return questions;
  }

  /**
   * Submits, scores, and records a student's practice exam attempt.
   * Completely isolated from official TestAssignment records.
   */
  public static async submitPracticeSet(params: SubmitPracticeParams): Promise<any> {
    const { subject, topic, difficulty, questions, answers, userId } = params;

    let score = 0;
    const totalMarks = questions.length; // 1 mark per question
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;

    const evaluatedQuestions = questions.map((q, idx) => {
      const studentAns = answers[idx];
      let isCorrect = false;

      if (studentAns === undefined || studentAns === null || studentAns === '') {
        unansweredCount++;
      } else if (q.type === 'MCQ') {
        const correctIndex = parseInt(q.correctAnswer, 10);
        const studentIndex = parseInt(studentAns, 10);
        if (correctIndex === studentIndex) {
          isCorrect = true;
          correctCount++;
          score += 1.0;
        } else {
          incorrectCount++;
        }
      } else if (q.type === 'NAT') {
        const correctVal = parseFloat(q.correctAnswer);
        const studentVal = parseFloat(studentAns);
        const tolerance = parseFloat(q.tolerance || 0);

        if (!isNaN(studentVal) && Math.abs(studentVal - correctVal) <= tolerance) {
          isCorrect = true;
          correctCount++;
          score += 1.0;
        } else {
          incorrectCount++;
        }
      }

      return {
        ...q,
        studentAnswer: studentAns,
        isCorrect,
      };
    });

    const accuracy = questions.length > 0 ? parseFloat(((correctCount / questions.length) * 100).toFixed(2)) : 0;

    // Save AIPracticeAttempt to database
    const attempt = await prisma.aIPracticeAttempt.create({
      data: {
        studentId: userId,
        subject,
        topic,
        difficulty,
        questionCount: questions.length,
        score,
        totalMarks,
      },
    });

    return {
      attemptId: attempt.id,
      score,
      totalMarks,
      accuracy,
      correctCount,
      incorrectCount,
      unansweredCount,
      evaluatedQuestions,
      createdAt: attempt.createdAt,
    };
  }
}
