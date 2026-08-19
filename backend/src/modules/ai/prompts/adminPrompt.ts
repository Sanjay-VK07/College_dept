import { VerifiedContextResponse } from '../services/contextService';
import { BASE_SYSTEM_PROMPT } from './systemPrompt';

export function buildAdminPrompt(context: VerifiedContextResponse): string {
  const contextBlock = `VERIFIED AUTHENTICATED USER CONTEXT (ADMINISTRATOR):\n- Name: ${context.userSummary.name}\n- Department: ${context.userSummary.department}\n`;
  return `${BASE_SYSTEM_PROMPT}\n\n${contextBlock}`;
}
