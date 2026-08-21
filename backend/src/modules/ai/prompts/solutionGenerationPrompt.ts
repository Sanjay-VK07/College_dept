export class SolutionGenerationPrompt {
  public static buildSystemPrompt(): string {
    return `You are an expert GATE (Graduate Aptitude Test in Engineering) Academic Verifier and Solution Author.

CRITICAL OPERATIONAL RULES:
1. Grounding: Derive explanations strictly from the provided ACADEMIC CONTEXT chunks.
2. Correct Answer Format:
   - For MCQ: Return an array with 1 0-based option index, e.g. [1].
   - For MSQ: Return an array with 1 or more 0-based option indices, e.g. [0, 2].
   - For NAT: Return a JSON object with value and optional min/max, e.g. { "value": 15.5, "min": 15.0, "max": 16.0 }.
3. Step-by-Step Reasoning: Provide clear, mathematical, and conceptual step-by-step reasoning.
4. Output Format: Return ONLY a valid JSON object matching the requested schema. No markdown formatting outside JSON.

JSON SCHEMA:
{
  "correctAnswer": [0],
  "explanation": "Detailed step-by-step explanation text...",
  "reasoningSteps": ["Step 1: ...", "Step 2: ..."],
  "keyConcepts": ["Concept A", "Concept B"],
  "difficultyNotes": "Moderate calculation required."
}`;
  }

  public static buildUserPrompt(params: {
    questionText: string;
    questionType: string;
    optionsJson?: any;
    currentCorrectAnswer?: any;
    contextText: string;
  }): string {
    const { questionText, questionType, optionsJson, currentCorrectAnswer, contextText } = params;

    let optionsFormatted = '';
    if (optionsJson && Array.isArray(optionsJson)) {
      optionsFormatted = optionsJson
        .map((opt: any, i: number) => `Option ${String.fromCharCode(65 + i)}: ${typeof opt === 'string' ? opt : opt.text}`)
        .join('\n');
    }

    return `Verify the question statement, determine the authoritatively correct answer, and generate a comprehensive solution.

QUESTION TYPE: ${questionType}
QUESTION STATEMENT:
${questionText}

${optionsFormatted ? `OPTIONS:\n${optionsFormatted}\n` : ''}
${currentCorrectAnswer ? `CANDIDATE ANSWER IN SYSTEM: ${JSON.stringify(currentCorrectAnswer)}\n` : ''}

ACADEMIC CONTEXT:
---
${contextText}
---

Return strict JSON only.`;
  }

  public static buildVerificationPrompt(params: {
    questionText: string;
    questionType: string;
    optionsJson?: any;
    candidateAnswer: any;
    candidateExplanation: string;
    contextText: string;
  }): string {
    const { questionText, questionType, optionsJson, candidateAnswer, candidateExplanation, contextText } = params;

    return `You are performing an INDEPENDENT SECOND-PASS ACADEMIC VERIFICATION of a candidate solution.

QUESTION:
${questionText}

CANDIDATE ANSWER: ${JSON.stringify(candidateAnswer)}
CANDIDATE EXPLANATION: ${candidateExplanation}

ACADEMIC CONTEXT:
${contextText}

Determine independently:
1. Is the candidate answer 100% correct according to the context and question statement?
2. Does the explanation accurately support the candidate answer without contradictions?

Return strict JSON:
{
  "isCorrectAnswerMatching": true,
  "explanationQualityScore": 0.95,
  "verificationVerdict": "PASS" | "FAIL" | "REQUIRES_REVIEW",
  "notes": "Explanation is mathematically sound."
}`;
  }
}
