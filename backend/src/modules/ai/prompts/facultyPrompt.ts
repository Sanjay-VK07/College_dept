import { VerifiedContextResponse } from '../services/contextService';
import { BASE_SYSTEM_PROMPT } from './systemPrompt';

export function buildFacultyPrompt(context: VerifiedContextResponse): string {
  let contextBlock = `VERIFIED AUTHENTICATED USER CONTEXT (FACULTY):\n- Name: ${context.userSummary.name}\n- Department: ${context.userSummary.department}\n`;

  if (context.upcomingExams && context.upcomingExams.length > 0) {
    contextBlock += `- Created Tests:\n` + context.upcomingExams.map((e) => `  * ${e.title} (${e.durationMinutes} mins)`).join('\n') + '\n';
  }

  return `${BASE_SYSTEM_PROMPT}\n\n${contextBlock}`;
}
