import { QuestionType, Difficulty, AIGeneratedQuestionStatus, AIQuestionQualityStatus, AIQuestionSimilarityStatus } from '@prisma/client';

export interface GenerateQuestionsDTO {
  subjectId?: string;
  moduleId?: string;
  topicId?: string;
  subtopicId?: string;
  questionType?: QuestionType;
  difficulty?: Difficulty;
  count?: number;
  documentId?: string;
  generationRequestId?: string;
}

export interface RawGeneratedQuestion {
  type: QuestionType;
  stem: string;
  options?: Array<{ text: string; latex?: string; image?: string }> | string[];
  correctAnswer: number[] | { value: number; min?: number; max?: number; tolerance?: number };
  explanation?: string;
  difficulty?: Difficulty;
  sourceChunkIds?: string[];
  sourceDocumentIds?: string[];
}

export interface QuestionValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  structuralScore: number;
  qualityStatus: AIQuestionQualityStatus;
  qualityScore: number;
  sanitizedStem: string;
  sanitizedExplanation: string;
  normalizedOptions: Array<{ text: string }> | null;
  normalizedCorrectAnswer: any;
}

export interface QuestionSimilarityResult {
  status: AIQuestionSimilarityStatus;
  similarityScore: number;
  similarQuestionId?: string;
}

export interface QuestionGenerationResult {
  success: boolean;
  message?: string;
  generationRequestId?: string;
  generatedCount: number;
  questions: any[];
  traceId?: string;
}
