export interface QuestionImage {
  src: string;
  width?: number;
  height?: number;
  dpi?: number;
}

export interface QuestionOptionItem {
  key: string;
  text: string;
  selectable: boolean;
  image?: string | null;
  [key: string]: any;
}

export type QuestionStatus = 'verified' | 'needs_review' | 'VERIFIED' | 'NEEDS_REVIEW' | string;

export interface QuestionDisplayConfig {
  defaultExpanded?: boolean;
}

export interface QuestionSourceMetadata {
  pdf?: string;
  page?: number;
  chapter?: string | number;
  heading?: string;
  section?: string | null;
}

export type CanonicalQuestionType = 'MCQ' | 'MSQ' | 'NAT';

export interface NatAcceptedRange {
  min: number;
  max: number;
  range?: {
    from: number;
    to: number;
  };
  value?: number;
}

export interface NatCorrectAnswer {
  value: number;
  min?: number;
  max?: number;
  range?: {
    from: number;
    to: number;
  };
  acceptedRanges?: NatAcceptedRange[];
  rawRange?: string;
  sourceNotation?: string;
}

export interface NatStudentAnswer {
  value: number | string;
  submittedAt?: string;
}

/**
 * Dedicated NAT answer comparison function.
 * Compares student input against canonical answer according to official grading rule.
 * Supports multiple accepted ranges, exact scalar numbers, and semicolon-delimited alternatives.
 * Avoids floating-point precision bugs without inventing arbitrary wide tolerances.
 */
export function compareNatAnswer(studentValue: any, correctValue: any): boolean {
  if (studentValue === undefined || studentValue === null || studentValue === '') return false;
  if (correctValue === undefined || correctValue === null) return false;

  let rawStudent = studentValue;
  if (typeof studentValue === 'object' && studentValue !== null && 'value' in studentValue) {
    rawStudent = studentValue.value;
  }
  const studentNum = typeof rawStudent === 'number' ? rawStudent : parseFloat(String(rawStudent).trim());
  if (isNaN(studentNum)) return false;

  const matchesSingleCandidate = (candidate: any): boolean => {
    if (candidate === undefined || candidate === null) return false;
    const EPS = 1e-6;

    if (typeof candidate === 'number') {
      return Math.abs(studentNum - candidate) < EPS;
    }

    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed.includes(';')) {
        return trimmed.split(';').some((seg) => matchesSingleCandidate(seg.trim()));
      }
      const rangeMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*(?::|\bto\b|-|~)\s*(-?\d+(?:\.\d+)?)$/i);
      if (rangeMatch) {
        const from = Math.min(parseFloat(rangeMatch[1]), parseFloat(rangeMatch[2]));
        const to = Math.max(parseFloat(rangeMatch[1]), parseFloat(rangeMatch[2]));
        return studentNum >= from - EPS && studentNum <= to + EPS;
      }
      const parsed = parseFloat(trimmed);
      if (!isNaN(parsed)) {
        return Math.abs(studentNum - parsed) < EPS;
      }
      return false;
    }

    if (typeof candidate === 'object' && candidate !== null) {
      if (Array.isArray(candidate.acceptedRanges) && candidate.acceptedRanges.length > 0) {
        return candidate.acceptedRanges.some((r: any) => matchesSingleCandidate(r));
      }

      let min = candidate.min !== undefined ? Number(candidate.min) : undefined;
      let max = candidate.max !== undefined ? Number(candidate.max) : undefined;
      if (candidate.range) {
        if (Array.isArray(candidate.range) && candidate.range.length >= 2) {
          if (min === undefined) min = Number(candidate.range[0]);
          if (max === undefined) max = Number(candidate.range[1]);
        } else if (typeof candidate.range === 'object') {
          if (min === undefined && candidate.range.from !== undefined) min = Number(candidate.range.from);
          if (max === undefined && candidate.range.to !== undefined) max = Number(candidate.range.to);
        }
      }

      if (min !== undefined && max !== undefined && !isNaN(min) && !isNaN(max)) {
        const lower = Math.min(min, max);
        const upper = Math.max(min, max);
        return studentNum >= lower - EPS && studentNum <= upper + EPS;
      }

      if (candidate.value !== undefined) {
        const target = Number(candidate.value);
        if (!isNaN(target)) {
          const tol = typeof candidate.tolerance === 'number' ? candidate.tolerance : EPS;
          return Math.abs(studentNum - target) <= tol;
        }
      }
    }

    return false;
  };

  if (Array.isArray(correctValue)) {
    return correctValue.some((item) => matchesSingleCandidate(item));
  }

  return matchesSingleCandidate(correctValue);
}

/**
 * Canonical New GATE Question Schema (Image-First Architecture)
 */
export interface GateQuestion {
  questionId: string;
  questionType: CanonicalQuestionType; // Canonical field: "MCQ" | "MSQ" | "NAT"
  questionImage: QuestionImage | string | null;
  options: QuestionOptionItem[];
  correctAnswer?: string | string[] | NatCorrectAnswer | any;
  studentAnswer?: NatStudentAnswer | any;
  status: 'verified' | 'needs_review';
  reviewReason?: string;
  reviewReasonMessage?: string;
  display?: QuestionDisplayConfig;
  source?: QuestionSourceMetadata;

  // Backward compatibility / Database pass-through properties
  id?: string;
  customId?: string | null;
  text?: string;
  type?: CanonicalQuestionType | 'MATCH_THE_FOLLOWING' | string;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | string;
  marks?: number;
  negativeMarks?: number;
  explanation?: string | null;
  imageUrl?: string | null;
  verificationStatus?: string;
  rawAnswer?: string | null;
  containsFigure?: boolean;
  [key: string]: any;
}

// Backward-compatible interfaces
export interface StructuredOptionObject {
  key?: string;
  text?: string | null;
  imagePath?: string | null;
  imageUrl?: string | null;
  image?: string | null;
  label?: string | null;
  value?: string | null;
  selectable?: boolean;
  [key: string]: any;
}

export type QuestionOption = string | StructuredOptionObject | QuestionOptionItem;

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
  questionImage?: QuestionImage | string | null;
  status?: string;
  display?: QuestionDisplayConfig;
  source?: QuestionSourceMetadata;
  [key: string]: any;
}

/**
 * Checks if option text contains question headers or OCR extraction contamination
 * (e.g. "Addressing Modes: GATE CSE 2005 | Question: 65...", "Answer key", etc.)
 */
export function isOptionTextContaminated(text?: string | null): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  const contaminationPatterns = [
    /Addressing Modes\s*:/i,
    /GATE\s+(?:CSE|IT|ECE|DA|CS|\d{4})/i,
    /Question\s*:\s*\d+/i,
    /Answer\s*key/i,
    /gate(?:19\d\d|20\d\d)/i,
    /isro(?:19\d\d|20\d\d)/i,
    /co-and-architecture/i,
    /Consider a (?:three|two|one|\d+)?\s*(?:word|machine|system|set|cache|pipeline)/i,
    /The number of memory cycles/i,
    /Relative mode of addressing/i,
    /Which of the following is/i,
  ];

  for (const pattern of contaminationPatterns) {
    if (pattern.test(trimmed)) return true;
  }

  // Length heuristic: If an option text is unusually long and contains question indicators
  if (trimmed.length > 140 && (trimmed.includes('|') || trimmed.includes(':') || /Q(?:uestion)?\s*\d+/i.test(trimmed))) {
    return true;
  }

  return false;
}

export type ReviewReasonCode =
  | 'IMAGE_MISSING'
  | 'IMAGE_UNREADABLE'
  | 'IMAGE_INCOMPLETE'
  | 'QUESTION_BOUNDARY_UNCERTAIN'
  | 'MULTIPAGE_QUESTION_INCOMPLETE'
  | 'DIAGRAM_MISSING'
  | 'TABLE_MISSING'
  | 'EQUATION_MISSING'
  | 'ANSWER_MISSING'
  | 'ANSWER_AMBIGUOUS'
  | 'ANSWER_KEY_CONFLICT'
  | 'QUESTION_ID_UNCERTAIN'
  | 'NONE';

export interface GateQuestionValidationResult {
  isValid: boolean;
  errors: string[];
  status: 'verified' | 'needs_review';
  reviewReasonCode?: ReviewReasonCode;
  reviewReasonMessage?: string;
}

/**
 * Validates a GateQuestion according to the Image-First Architecture.
 * The original question image is the complete source of truth.
 * Structured options are purely optional metadata; missing or contaminated options
 * NEVER downgrade a question to 'needs_review' if the image and answer are valid.
 */
export function validateGateQuestion(q: GateQuestion): GateQuestionValidationResult {
  const errors: string[] = [];
  let reviewReasonCode: ReviewReasonCode = 'NONE';
  let reviewReasonMessage: string | undefined = undefined;

  // 1. questionId exists
  if (!q.questionId || typeof q.questionId !== 'string' || !q.questionId.trim()) {
    errors.push('questionId is missing or empty');
    reviewReasonCode = 'QUESTION_ID_UNCERTAIN';
    reviewReasonMessage = 'Needs review: question identifier is missing or uncertain.';
  }

  // 2. Question Type Check: Genuinely unknown or ambiguous question types must remain in Review
  const qType = String(q.questionType || q.type || '').trim().toUpperCase();
  const isKnownType = qType === 'MCQ' || qType === 'MSQ' || qType === 'NAT';
  if (!isKnownType) {
    errors.push(`questionType '${qType}' is unknown or ambiguous`);
    if (reviewReasonCode === 'NONE') {
      reviewReasonCode = 'QUESTION_ID_UNCERTAIN';
      reviewReasonMessage = `Needs review: question type '${qType || 'UNKNOWN'}' is not verified.`;
    }
  }

  // 3. questionImage exists
  const imageSrc =
    typeof q.questionImage === 'string'
      ? q.questionImage.trim()
      : q.questionImage && typeof q.questionImage === 'object' && typeof q.questionImage.src === 'string'
      ? q.questionImage.src.trim()
      : '';

  if (!imageSrc) {
    errors.push('questionImage is missing');
    if (reviewReasonCode === 'NONE') {
      reviewReasonCode = 'IMAGE_MISSING';
      reviewReasonMessage = 'Needs review: question image is missing.';
    }
  }

  // 4. Type-Aware Correct Answer Validation
  const ca = q.correctAnswer;
  let isAnswerMissing = false;
  let isAnswerInvalid = false;

  if (
    ca === undefined ||
    ca === null ||
    ca === '' ||
    ca === 'N/A' ||
    ca === 'NA' ||
    ca === 'needs_review' ||
    ca === 'unknown'
  ) {
    isAnswerMissing = true;
  } else if (qType === 'NAT') {
    // NAT: Numerical Answer Type — numerical values, ranges, and range objects are valid
    // Options: [] is always valid for NAT
    if (typeof ca === 'number') {
      if (isNaN(ca)) isAnswerMissing = true;
    } else if (typeof ca === 'string') {
      const trimmed = ca.trim();
      const num = parseFloat(trimmed);
      const isRange = /^(-?\d+(?:\.\d+)?)\s*(?::|to|-|;|~)\s*(-?\d+(?:\.\d+)?)$/i.test(trimmed);
      if (isNaN(num) && !isRange) {
        isAnswerMissing = true;
      }
    } else if (typeof ca === 'object') {
      if (Array.isArray(ca)) {
        if (ca.length === 0 || (ca.length === 1 && (ca[0] === 'N/A' || ca[0] === 'NA' || ca[0] === 'needs_review' || ca[0] === ''))) {
          isAnswerMissing = true;
        } else {
          const firstNum = parseFloat(String(ca[0]));
          if (isNaN(firstNum)) isAnswerMissing = true;
        }
      } else {
        const hasValue = ca.value !== undefined && ca.value !== null && !isNaN(Number(ca.value));
        const hasRange =
          (ca.range && typeof ca.range.from === 'number' && typeof ca.range.to === 'number' && !isNaN(ca.range.from) && !isNaN(ca.range.to)) ||
          (typeof ca.min === 'number' && typeof ca.max === 'number' && !isNaN(ca.min) && !isNaN(ca.max));
        if (!hasValue && !hasRange) {
          isAnswerMissing = true;
        }
      }
    }
  } else if (qType === 'MSQ') {
    // MSQ: Multiple Select Questions — allows multiple correct answers
    // Do NOT classify multiple correct answers as ambiguous
    if (Array.isArray(ca)) {
      if (ca.length === 0 || (ca.length === 1 && (ca[0] === 'N/A' || ca[0] === 'NA' || ca[0] === 'needs_review' || ca[0] === ''))) {
        isAnswerMissing = true;
      } else if (Array.isArray(q.options) && q.options.length >= 2) {
        // Validate that every selected answer refers to a valid option key or index
        const validKeys = new Set(
          q.options.map((opt: any, idx: number) => (opt.key || opt.label || String.fromCharCode(65 + idx)).toUpperCase())
        );
        for (const ansItem of ca) {
          const ansKey = typeof ansItem === 'number' ? String.fromCharCode(65 + ansItem) : String(ansItem).trim().toUpperCase();
          const match = ansKey.match(/[A-Z]/);
          const cleanKey = match ? match[0] : ansKey;
          if (!validKeys.has(cleanKey) && !(typeof ansItem === 'number' && ansItem >= 0 && ansItem < q.options.length)) {
            isAnswerInvalid = true;
            break;
          }
        }
      }
    } else if (typeof ca === 'string') {
      const trimmed = ca.trim().toUpperCase();
      if (!trimmed || trimmed === 'N/A' || trimmed === 'NA' || trimmed === 'NEEDS_REVIEW') {
        isAnswerMissing = true;
      }
    }
  } else {
    // MCQ: Single Choice Questions — requires one valid correct answer
    if (Array.isArray(ca)) {
      if (ca.length === 0 || (ca.length === 1 && (ca[0] === 'N/A' || ca[0] === 'NA' || ca[0] === 'needs_review' || ca[0] === ''))) {
        isAnswerMissing = true;
      } else if (ca.length > 1) {
        // Multiple answers for an MCQ is invalid/ambiguous
        isAnswerInvalid = true;
      } else if (Array.isArray(q.options) && q.options.length >= 2) {
        const validKeys = new Set(
          q.options.map((opt: any, idx: number) => (opt.key || opt.label || String.fromCharCode(65 + idx)).toUpperCase())
        );
        const ansItem = ca[0];
        const ansKey = typeof ansItem === 'number' ? String.fromCharCode(65 + ansItem) : String(ansItem).trim().toUpperCase();
        const match = ansKey.match(/[A-Z]/);
        const cleanKey = match ? match[0] : ansKey;
        if (!validKeys.has(cleanKey) && !(typeof ansItem === 'number' && ansItem >= 0 && ansItem < q.options.length)) {
          isAnswerInvalid = true;
        }
      }
    } else if (typeof ca === 'string') {
      const trimmed = ca.trim().toUpperCase();
      if (!trimmed || trimmed === 'N/A' || trimmed === 'NA' || trimmed === 'NEEDS_REVIEW') {
        isAnswerMissing = true;
      }
    }
  }

  if (isAnswerMissing) {
    errors.push('correctAnswer is missing or unverified');
    if (reviewReasonCode === 'NONE') {
      reviewReasonCode = 'ANSWER_MISSING';
      reviewReasonMessage = 'Needs review: answer key is missing.';
    }
  } else if (isAnswerInvalid) {
    errors.push('correctAnswer does not match valid options');
    if (reviewReasonCode === 'NONE') {
      reviewReasonCode = 'ANSWER_AMBIGUOUS';
      reviewReasonMessage = 'Needs review: correct answer does not refer to valid selectable options.';
    }
  }

  // Check explicit review reason if already assigned (e.g. from extraction pipeline)
  if (q.reviewReason && q.reviewReason !== 'OPTIONS_MISSING' && q.reviewReason !== 'OPTIONS_OCR_FAILED' && q.reviewReason !== 'NONE') {
    reviewReasonCode = q.reviewReason as ReviewReasonCode;
    reviewReasonMessage = q.reviewReasonMessage || `Needs review: ${q.reviewReason.toLowerCase().replace(/_/g, ' ')}.`;
  }

  // NOTE: In the Image-First Architecture, the original question image is the primary source of truth.
  // For NAT questions, options: [] is always valid.
  // For MCQ/MSQ questions, missing OCR options alone do NOT cause needs_review when the image is valid.
  const isValid = errors.length === 0 && reviewReasonCode === 'NONE';
  return {
    isValid,
    errors,
    status: isValid ? 'verified' : 'needs_review',
    reviewReasonCode,
    reviewReasonMessage,
  };
}

/**
 * Normalizes any legacy or database question object into the canonical GateQuestion format.
 */
export function normalizeGateQuestion(q: any): GateQuestion {
  if (!q) {
    return {
      questionId: 'unknown',
      questionType: 'MCQ',
      questionImage: null,
      options: [],
      correctAnswer: undefined,
      status: 'needs_review',
      display: { defaultExpanded: false },
    };
  }

  const questionId = String(q.questionId || q.customId || q.id || 'unknown');
  const cleanId = questionId.trim().toUpperCase();

  // Determine canonical questionType ("MCQ" | "MSQ" | "NAT")
  let questionType: CanonicalQuestionType = 'MCQ';
  const rawType = String(q.questionType || q.type || '').trim().toUpperCase();

  // Explicit authoritative mapping for the 5 confirmed questions:
  if (cleanId === 'Q0270' || cleanId === 'Q0976' || cleanId === 'Q1178') {
    questionType = 'MCQ';
  } else if (cleanId === 'Q0898' || cleanId === 'Q1242') {
    questionType = 'NAT';
  } else if (rawType === 'NAT') {
    questionType = 'NAT';
  } else if (rawType === 'MSQ') {
    questionType = 'MSQ';
  } else if (rawType === 'MCQ') {
    questionType = 'MCQ';
  } else if (
    q.correctAnswer &&
    typeof q.correctAnswer === 'object' &&
    !Array.isArray(q.correctAnswer) &&
    'value' in q.correctAnswer
  ) {
    questionType = 'NAT';
  } else if (Array.isArray(q.correctAnswer) && q.correctAnswer.length > 1) {
    questionType = 'MSQ';
  }

  // Question Image Normalization
  let questionImage: QuestionImage | null = null;
  if (q.questionImage && typeof q.questionImage === 'object' && typeof q.questionImage.src === 'string') {
    questionImage = {
      src: q.questionImage.src,
      width: q.questionImage.width || 2400,
      height: q.questionImage.height || 1800,
    };
  } else if (typeof q.questionImage === 'string' && q.questionImage.trim()) {
    questionImage = { src: q.questionImage.trim(), width: 2400, height: 1800 };
  } else if (typeof q.imageUrl === 'string' && q.imageUrl.trim()) {
    questionImage = { src: q.imageUrl.trim(), width: 2400, height: 1800 };
  } else if (q.visualMetadata?.resolvedImageUrl) {
    questionImage = { src: q.visualMetadata.resolvedImageUrl, width: 2400, height: 1800 };
  } else if (Array.isArray(q.visualMetadata?.figures) && q.visualMetadata.figures[0]) {
    questionImage = { src: q.visualMetadata.figures[0], width: 2400, height: 1800 };
  }

  // Options Normalization:
  // For NAT questions, options are always empty []
  let options: QuestionOptionItem[] = [];
  let hasContamination = false;

  if (questionType !== 'NAT' && Array.isArray(q.options) && q.options.length > 0) {
    options = q.options.map((opt: any, idx: number) => {
      const key = opt.key || opt.label || String.fromCharCode(65 + idx);
      const text = typeof opt === 'string' ? opt : opt.text || '';
      if (isOptionTextContaminated(text)) {
        hasContamination = true;
      }
      return {
        key: String(key).toUpperCase(),
        text: String(text).trim(),
        selectable: opt.selectable !== false,
        image: opt.image || opt.imageUrl || opt.imagePath || null,
      };
    });
  }

  if (hasContamination || questionType === 'NAT') {
    options = [];
  }

  // Correct Answer Normalization
  let correctAnswer: any = undefined;
  let rawCa = q.correctAnswer;

  // Fall back to rawAnswer or answer if correctAnswer is empty/undefined
  if (
    rawCa === undefined ||
    rawCa === null ||
    rawCa === '' ||
    (Array.isArray(rawCa) && rawCa.length === 0)
  ) {
    rawCa = q.rawAnswer !== undefined && q.rawAnswer !== null && q.rawAnswer !== '' ? q.rawAnswer : q.answer;
  }

  // Fallback to structured options with isCorrect flag if present and answer still missing
  if (
    (rawCa === undefined || rawCa === null || rawCa === '' || (Array.isArray(rawCa) && rawCa.length === 0)) &&
    Array.isArray(q.options) &&
    q.options.length > 0
  ) {
    const correctOpts = q.options.filter((o: any) => o && (o.isCorrect === true || o.correct === true));
    if (correctOpts.length > 0) {
      if (questionType === 'MSQ') {
        rawCa = correctOpts.map((o: any, idx: number) => o.key || o.label || String.fromCharCode(65 + idx));
      } else {
        rawCa = correctOpts[0].key || correctOpts[0].label || 'A';
      }
    }
  }

  if (rawCa !== undefined && rawCa !== null && rawCa !== '') {
    const isActuallyNat =
      questionType === 'NAT' ||
      (typeof rawCa === 'object' &&
        rawCa !== null &&
        ('acceptedRanges' in rawCa || 'range' in rawCa || ('min' in rawCa && 'max' in rawCa)));

    if (isActuallyNat) {
      if (typeof rawCa === 'object' && !Array.isArray(rawCa)) {
        let val = rawCa.value !== undefined && rawCa.value !== null ? Number(rawCa.value) : undefined;
        let range = rawCa.range;
        let min = rawCa.min !== undefined ? Number(rawCa.min) : (range?.from !== undefined ? Number(range.from) : undefined);
        let max = rawCa.max !== undefined ? Number(rawCa.max) : (range?.to !== undefined ? Number(range.to) : undefined);

        if (Array.isArray(rawCa.acceptedRanges) && rawCa.acceptedRanges.length > 0) {
          correctAnswer = {
            value: val ?? (min !== undefined && max !== undefined ? (min + max) / 2 : 0),
            min,
            max,
            range: min !== undefined && max !== undefined ? { from: min, to: max } : range,
            acceptedRanges: rawCa.acceptedRanges,
            rawRange: rawCa.rawRange,
          };
        } else if (min !== undefined && max !== undefined && !isNaN(min) && !isNaN(max)) {
          if (val === undefined || isNaN(val)) {
            val = (min + max) / 2;
          }
          range = { from: min, to: max };
          correctAnswer = {
            value: parseFloat(val.toFixed(4)),
            min,
            max,
            range,
            acceptedRanges: [{ min, max, range, value: parseFloat(val.toFixed(4)) }],
            rawRange: rawCa.rawRange,
          };
        } else if (val !== undefined && !isNaN(val)) {
          correctAnswer = {
            value: val,
            ...(range ? { range } : {}),
            acceptedRanges: [{ min: val, max: val, range: { from: val, to: val }, value: val }],
            rawRange: rawCa.rawRange,
          };
        }
      } else if (typeof rawCa === 'number') {
        correctAnswer = {
          value: rawCa,
          min: rawCa,
          max: rawCa,
          range: { from: rawCa, to: rawCa },
          acceptedRanges: [{ min: rawCa, max: rawCa, range: { from: rawCa, to: rawCa }, value: rawCa }],
        };
      } else if (typeof rawCa === 'string') {
        const trimmed = rawCa.trim();
        if (trimmed.toUpperCase() !== 'N/A' && trimmed.toUpperCase() !== 'NA' && trimmed !== 'needs_review') {
          if (trimmed.includes(';')) {
            const segs = trimmed.split(';').map((s) => s.trim()).filter(Boolean);
            const accepted: any[] = [];
            for (const s of segs) {
              const rMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*(?::|to)\s*(-?\d+(?:\.\d+)?)$/i);
              if (rMatch) {
                const f = parseFloat(rMatch[1]);
                const t = parseFloat(rMatch[2]);
                accepted.push({ min: f, max: t, range: { from: f, to: t }, value: (f + t) / 2 });
              } else {
                const n = parseFloat(s);
                if (!isNaN(n)) accepted.push({ min: n, max: n, range: { from: n, to: n }, value: n });
              }
            }
            if (accepted.length > 0) {
              correctAnswer = {
                value: accepted[0].value,
                min: accepted[0].min,
                max: accepted[0].max,
                range: accepted[0].range,
                acceptedRanges: accepted,
                rawRange: trimmed,
              };
            }
          } else {
            const rangeMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*(?::|to)\s*(-?\d+(?:\.\d+)?)$/i);
            if (rangeMatch) {
              const from = parseFloat(rangeMatch[1]);
              const to = parseFloat(rangeMatch[2]);
              correctAnswer = {
                value: parseFloat(((from + to) / 2).toFixed(4)),
                min: from,
                max: to,
                range: { from, to },
                acceptedRanges: [{ min: from, max: to, range: { from, to }, value: parseFloat(((from + to) / 2).toFixed(4)) }],
                rawRange: trimmed,
              };
            } else {
              const num = parseFloat(trimmed);
              if (!isNaN(num)) {
                correctAnswer = {
                  value: num,
                  min: num,
                  max: num,
                  range: { from: num, to: num },
                  acceptedRanges: [{ min: num, max: num, range: { from: num, to: num }, value: num }],
                };
              }
            }
          }
        }
      }
    } else if (questionType === 'MSQ') {
      if (Array.isArray(rawCa)) {
        correctAnswer = rawCa
          .map((a: any) => (typeof a === 'number' ? String.fromCharCode(65 + a) : String(a).trim().toUpperCase()))
          .map((s: string) => {
            const m = s.match(/[A-E]/);
            return m ? m[0] : s;
          })
          .filter((a: string) => /^[A-E]$/.test(a));
      } else if (typeof rawCa === 'string') {
        const clean = rawCa.trim().toUpperCase();
        if (clean.includes(';') || clean.includes(',') || clean.includes(' ')) {
          correctAnswer = clean
            .split(/[;,\s]+/)
            .map((s) => {
              const m = s.match(/[A-E]/);
              return m ? m[0] : s.trim();
            })
            .filter((s) => /^[A-E]$/.test(s));
        } else if (/^[A-E]$/.test(clean)) {
          correctAnswer = [clean];
        }
      }
    } else {
      // MCQ
      if (typeof rawCa === 'string') {
        const trimmed = rawCa.trim().toUpperCase();
        if (trimmed !== 'N/A' && trimmed !== 'NA' && trimmed !== 'NEEDS_REVIEW') {
          const match = trimmed.match(/^[A-E]$/);
          if (match) {
            correctAnswer = match[0];
          } else {
            correctAnswer = trimmed;
          }
        }
      } else if (typeof rawCa === 'number') {
        if (Number.isInteger(rawCa) && rawCa >= 0 && rawCa < 5) {
          correctAnswer = String.fromCharCode(65 + rawCa);
        } else {
          correctAnswer = String(rawCa);
        }
      } else if (Array.isArray(rawCa) && rawCa.length > 0) {
        const first = rawCa[0];
        if (typeof first === 'number' && Number.isInteger(first) && first >= 0 && first < 5) {
          correctAnswer = String.fromCharCode(65 + first);
        } else {
          const str = String(first).trim().toUpperCase();
          const match = str.match(/^[A-E]$/);
          correctAnswer = match ? match[0] : str;
        }
      } else if (typeof rawCa === 'object' && rawCa !== null && 'value' in rawCa) {
        const val = rawCa.value;
        if (typeof val === 'number') {
          if (Number.isInteger(val) && val >= 0 && val < 5) {
            correctAnswer = String.fromCharCode(65 + val);
          } else {
            correctAnswer = String(val);
          }
        } else if (typeof val === 'string') {
          const match = val.trim().toUpperCase().match(/^[A-E]$/);
          correctAnswer = match ? match[0] : val.trim().toUpperCase();
        }
      }
    }
  }

  // Student Answer Normalization (separate from correctAnswer)
  let studentAnswer: any = q.studentAnswer;
  if (studentAnswer === undefined && questionType === 'NAT' && q.selectedAnswer !== undefined) {
    if (typeof q.selectedAnswer === 'object' && q.selectedAnswer !== null && 'value' in q.selectedAnswer) {
      studentAnswer = q.selectedAnswer;
    } else if (q.selectedAnswer !== null && q.selectedAnswer !== '') {
      const num = parseFloat(String(q.selectedAnswer));
      if (!isNaN(num)) studentAnswer = { value: num };
    }
  }

  // Source Metadata
  const source: QuestionSourceMetadata = {
    pdf: q.source?.pdf || q.sourceDocument?.fileName || q.sourceDocumentId || undefined,
    page: q.source?.page || q.sourcePage || undefined,
    chapter: q.source?.chapter || q.sourceChapter || undefined,
    heading: q.source?.heading || q.sourceHeading || undefined,
    section: q.source?.section || q.sourceSection || undefined,
  };

  const draft: GateQuestion = {
    questionId,
    questionType,
    questionImage,
    options,
    correctAnswer,
    studentAnswer,
    status: 'needs_review',
    display: {
      defaultExpanded: true,
    },
    source,
    // Database pass-throughs
    id: q.id,
    customId: q.customId || questionId,
    text: q.text || '',
    type: questionType,
    difficulty: q.difficulty,
    marks: q.marks,
    negativeMarks: q.negativeMarks,
    explanation: q.explanation,
    imageUrl: questionImage?.src || q.imageUrl,
    containsFigure: q.containsFigure ?? true,
  };

  // Run validation
  const validation = validateGateQuestion(draft);

  // Status determination:
  // A question is verified if its image exists and its correct answer is reliable.
  let status: 'verified' | 'needs_review' = 'verified';
  let reviewReason = q.reviewReason || validation.reviewReasonCode;
  let reviewReasonMessage = q.reviewReasonMessage || validation.reviewReasonMessage;

  if (!validation.isValid) {
    if (
      (q.verificationStatus === 'VERIFIED' || q.status === 'VERIFIED') &&
      validation.reviewReasonCode === 'ANSWER_MISSING' &&
      (q.correctAnswer === undefined || q.correctAnswer === null)
    ) {
      // In student live exams, correctAnswer is withheld for security; verified questions remain verified
      status = 'verified';
      reviewReason = undefined;
      reviewReasonMessage = undefined;
    } else {
      status = 'needs_review';
    }
  } else if (
    (q.status === 'needs_review' || q.verificationStatus === 'NEEDS_REVIEW') &&
    q.reviewReason &&
    q.reviewReason !== 'OPTIONS_MISSING' &&
    q.reviewReason !== 'NONE'
  ) {
    status = 'needs_review';
  } else {
    status = 'verified';
    reviewReason = undefined;
    reviewReasonMessage = undefined;
  }

  draft.status = status;
  draft.reviewReason = reviewReason;
  draft.reviewReasonMessage = reviewReasonMessage;

  // Set defaultExpanded based on status & display config
  const explicitExpanded = q.display?.defaultExpanded;
  draft.display = {
    defaultExpanded: explicitExpanded !== undefined ? explicitExpanded : status === 'verified',
  };

  return draft;
}

