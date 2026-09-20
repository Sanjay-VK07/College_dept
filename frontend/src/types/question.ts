export interface StructuredOptionObject {
  text?: string | null;
  imagePath?: string | null;
  imageUrl?: string | null;
  image?: string | null;
  label?: string | null;
  value?: string | null;
  [key: string]: any;
}

export type QuestionOption = string | StructuredOptionObject;

export interface QuestionDTO {
  id: string;
  customId?: string | null;
  text: string;
  type: 'MCQ' | 'MSQ' | 'NAT' | 'MATCH_THE_FOLLOWING' | string;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | string;
  marks?: number;
  negativeMarks?: number;
  options?: QuestionOption[];
  correctAnswer?: any;
  explanation?: string | null;
  verificationStatus?: string;
  origin?: string;
  imageUrl?: string | null;
  containsFigure?: boolean;
  contentRepresentation?: 'TEXT' | 'IMAGE' | 'TEXT_WITH_IMAGE' | string;
  [key: string]: any;
}
