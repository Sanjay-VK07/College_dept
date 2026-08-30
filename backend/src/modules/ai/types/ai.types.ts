import { Role, AIMessageRole } from '@prisma/client';

export interface ChatAction {
  type: string;
  downloadUrl: string;
  fileName: string;
}

export interface ChatMessagePayload {
  role: 'USER' | 'ASSISTANT';
  content: string;
  action?: ChatAction;
}

export interface ChatRequestDTO {
  message: string;
  conversationId?: string;
  requestId?: string;
}

export interface ChatResponseData {
  success: boolean;
  type?: 'SUCCESS' | 'AI_PROVIDER_UNAVAILABLE' | 'AI_REQUEST_IN_PROGRESS' | 'PROMPT_INJECTION_DETECTED' | 'UNAUTHORIZED_ACTION' | 'NO_DATA' | 'EXPORT_READY';
  conversationId?: string;
  title?: string;
  message?: {
    id: string;
    role: AIMessageRole;
    content: string;
    createdAt: Date;
    action?: ChatAction;
  };
  action?: ChatAction;
  answer?: string;
  sources?: any[];
  messageId?: string;
  error?: string;
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastMessage?: string;
}
