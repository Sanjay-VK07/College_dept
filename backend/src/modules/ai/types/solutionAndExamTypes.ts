import { QuestionType, Difficulty, AISolutionStatus, AISolutionVerificationStatus, AIExamDraftStatus } from '@prisma/client';

export interface GenerateSolutionDTO {
  questionId: string;
  generationRequestId: string;
}

export interface RawGeneratedSolution {
  correctAnswer: any;
  explanation: string;
  reasoningSteps?: string[];
  keyConcepts?: string[];
  difficultyNotes?: string;
}

export interface SolutionVerificationResult {
  verificationStatus: AISolutionVerificationStatus;
  isCorrectAnswerMatching: boolean;
  explanationQualityScore: number;
  warnings: string[];
  errors: string[];
  verifiedAnswer?: any;
  verifiedExplanation?: string;
}

export interface AssembleExamDTO {
  examGenerationRequestId: string;
  title?: string;
  description?: string;
  subjectId?: string;
  moduleIds?: string[];
  topicIds?: string[];
  questionTypes?: QuestionType[];
  difficultyDistribution?: { EASY?: number; MEDIUM?: number; HARD?: number };
  questionCount: number;
  targetDepartment?: string;
  durationMinutes?: number;
  totalMarks?: number;
}

export interface ExamAssemblyResult {
  success: boolean;
  message?: string;
  examGenerationRequestId: string;
  mockTestId?: string;
  status: AIExamDraftStatus;
  requestedQuestionCount: number;
  selectedQuestionCount: number;
  actualDifficultyDistribution: { EASY: number; MEDIUM: number; HARD: number };
  topicCoverage: Array<{ topicId: string; topicName: string; questionCount: number }>;
  questions: any[];
  validationStatus: string;
  warnings: string[];
}
