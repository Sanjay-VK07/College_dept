import { prisma } from '../../../config/prisma';
import { Role, AISolutionStatus, AISolutionVerificationStatus } from '@prisma/client';
import { RAGService } from './ragService';
import { AIProviderService } from './aiProviderService';
import { SolutionValidationService } from './solutionValidationService';
import { SolutionGenerationPrompt } from '../prompts/solutionGenerationPrompt';
import { GenerateSolutionDTO, RawGeneratedSolution } from '../types/solutionAndExamTypes';

export class SolutionService {
  /**
   * Generates a grounded solution/explanation for an existing Question Bank item using RAG knowledge base context.
   */
  public static async generateSolution(userId: string, role: Role, dto: GenerateSolutionDTO) {
    if (role !== Role.FACULTY && role !== Role.ADMIN) {
      throw new Error('Forbidden: Only Faculty and Admin users can generate solutions.');
    }

    const { questionId, generationRequestId } = dto;

    if (!questionId) {
      throw new Error('Question ID is required.');
    }

    if (!generationRequestId) {
      throw new Error('Generation Request ID is required for idempotency.');
    }

    // 1. Idempotency Check
    const existingSolution = await prisma.aISolution.findUnique({
      where: { generationRequestId },
      include: { question: true },
    });

    if (existingSolution) {
      return {
        success: true,
        message: 'Returned previously generated solution (idempotent replay).',
        solution: existingSolution,
      };
    }

    // 2. Fetch Question Bank Item
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: { subtopic: { include: { topic: { include: { module: { include: { subject: true } } } } } } },
    });

    if (!question) {
      throw new Error(`Question '${questionId}' not found in Question Bank.`);
    }

    // 3. RAG Retrieval for Academic Context
    const ragQuery = `${question.subtopic?.topic?.module?.subject?.name || ''} ${question.text}`;
    const ragResult = await RAGService.executeRAGPipeline({
      userMessage: ragQuery,
      userId,
      role,
    });

    const chunks = ragResult.evaluation?.validatedChunks || [];

    if (!ragResult.ragUsed || chunks.length === 0) {
      return {
        success: false,
        message: 'Insufficient authorized academic context is available to verify this solution.',
      };
    }

    const contextText = chunks
      .map((c: any, i: number) => `[Chunk ${i + 1} - ${c.documentTitle}]: ${c.content}`)
      .join('\n\n');

    const sourceDocumentIds: string[] = Array.from(new Set(chunks.map((c: any) => c.documentId)));
    const sourceChunkIds: string[] = Array.from(new Set(chunks.map((c: any) => c.chunkId)));

    // 4. LLM Generation
    const systemPrompt = SolutionGenerationPrompt.buildSystemPrompt();
    const userPrompt = SolutionGenerationPrompt.buildUserPrompt({
      questionText: question.text,
      questionType: question.type,
      optionsJson: question.options,
      currentCorrectAnswer: question.correctAnswer,
      contextText,
    });

    const aiResponse = await AIProviderService.generateResponse(systemPrompt, [], userPrompt);

    if (!aiResponse.success || !aiResponse.content) {
      throw new Error(`AI Provider generation failed: ${aiResponse.message || 'Unknown error'}`);
    }

    // 5. Parse JSON
    let cleanJson = aiResponse.content.trim();
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    const rawSolution: RawGeneratedSolution = JSON.parse(cleanJson);

    // 6. Structural Validation
    const valResult = SolutionValidationService.validateSolutionStructure(question.type, rawSolution, question.options);

    if (!valResult.isValid) {
      throw new Error(`Solution structural validation failed: ${valResult.errors.join(' ')}`);
    }

    // 7. Independent Verification Pass
    const verifyResult = await SolutionValidationService.verifySolutionIndependently({
      questionText: question.text,
      questionType: question.type,
      optionsJson: question.options,
      candidateAnswer: valResult.normalizedAnswer,
      candidateExplanation: valResult.sanitizedExplanation,
      contextText,
    });

    // 8. Save AISolution in PENDING_REVIEW status
    const createdSolution = await prisma.aISolution.create({
      data: {
        questionId: question.id,
        generationRequestId,
        draftAnswer: valResult.normalizedAnswer,
        draftExplanation: valResult.sanitizedExplanation,
        verifiedAnswer: verifyResult.verifiedAnswer,
        verifiedExplanation: verifyResult.verifiedExplanation,
        status: AISolutionStatus.PENDING_REVIEW,
        verificationStatus: verifyResult.verificationStatus,
        qualityScore: verifyResult.explanationQualityScore,
        sourceDocumentIds,
        sourceChunkIds,
        generatedById: userId,
      },
    });

    return {
      success: true,
      message: 'Solution generated and submitted for Faculty review.',
      solution: createdSolution,
    };
  }

  /**
   * Retrieves pending AI-generated solutions for review.
   */
  public static async getPendingSolutions(params: { userId: string; role: Role; status?: AISolutionStatus }) {
    const { userId, role, status = AISolutionStatus.PENDING_REVIEW } = params;

    if (role !== Role.FACULTY && role !== Role.ADMIN) {
      throw new Error('Forbidden: Only Faculty and Admin can access solution review queue.');
    }

    const solutions = await prisma.aISolution.findMany({
      where: { status },
      include: {
        question: true,
        generatedBy: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      count: solutions.length,
      data: solutions,
    };
  }

  /**
   * Approves an AI solution using a database transaction, updating official Question explanation & correctAnswer.
   */
  public static async approveSolution(solutionId: string, userId: string, role: Role) {
    if (role !== Role.FACULTY && role !== Role.ADMIN) {
      throw new Error('Forbidden: Only Faculty and Admin can approve solutions.');
    }

    const solution = await prisma.aISolution.findUnique({
      where: { id: solutionId },
    });

    if (!solution) {
      throw new Error(`Solution '${solutionId}' not found.`);
    }

    // Transactionally update Question explanation & answer and set AISolution status to APPROVED
    const [updatedQuestion, updatedSolution] = await prisma.$transaction([
      prisma.question.update({
        where: { id: solution.questionId },
        data: {
          explanation: solution.verifiedExplanation || solution.draftExplanation,
          correctAnswer: (solution.verifiedAnswer || solution.draftAnswer) as any,
        },
      }),
      prisma.aISolution.update({
        where: { id: solutionId },
        data: { status: AISolutionStatus.APPROVED },
      }),
    ]);

    return {
      success: true,
      message: 'Solution approved and official Question Bank explanation updated!',
      question: updatedQuestion,
      solution: updatedSolution,
    };
  }

  /**
   * Rejects an AI solution.
   */
  public static async rejectSolution(solutionId: string, userId: string, role: Role) {
    if (role !== Role.FACULTY && role !== Role.ADMIN) {
      throw new Error('Forbidden: Only Faculty and Admin can reject solutions.');
    }

    const updated = await prisma.aISolution.update({
      where: { id: solutionId },
      data: { status: AISolutionStatus.REJECTED },
    });

    return {
      success: true,
      message: 'Solution rejected.',
      solution: updated,
    };
  }

  /**
   * Edits a draft solution prior to approval.
   */
  public static async editSolution(
    solutionId: string,
    userId: string,
    role: Role,
    data: { draftAnswer?: any; draftExplanation?: string }
  ) {
    if (role !== Role.FACULTY && role !== Role.ADMIN) {
      throw new Error('Forbidden: Only Faculty and Admin can edit solutions.');
    }

    const updated = await prisma.aISolution.update({
      where: { id: solutionId },
      data: {
        ...(data.draftAnswer !== undefined ? { draftAnswer: data.draftAnswer, verifiedAnswer: data.draftAnswer } : {}),
        ...(data.draftExplanation !== undefined ? { draftExplanation: data.draftExplanation, verifiedExplanation: data.draftExplanation } : {}),
      },
    });

    return {
      success: true,
      message: 'Solution updated.',
      solution: updated,
    };
  }
}
