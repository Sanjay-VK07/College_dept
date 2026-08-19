'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AIChatButton } from './AIChatButton';
import { AIChatWindow } from './AIChatWindow';
import { aiService, AIMessage } from '@/services/aiService';

export const AIAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [userRole, setUserRole] = useState<string>('STUDENT');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // In-flight request lock to prevent race conditions and rapid duplicate submissions
  const isSendingRef = useRef<boolean>(false);

  useEffect(() => {
    const token = localStorage.getItem('gsmas_token');
    const storedUserStr = localStorage.getItem('gsmas_user');

    if (token) {
      setIsAuthenticated(true);
      if (storedUserStr) {
        try {
          const userObj = JSON.parse(storedUserStr);
          if (userObj?.role) {
            setUserRole(userObj.role);
          }
        } catch (e) {
          // fallback default
        }
      }
    }
  }, []);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  const handleNewChat = () => {
    if (isSendingRef.current) return;
    setConversationId(undefined);
    setMessages([]);
  };

  const handleSendMessage = async (text: string, overrideRequestId?: string) => {
    if (!text.trim() || isLoading || isSendingRef.current) return;

    isSendingRef.current = true;
    const clientRequestId =
      overrideRequestId ||
      (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'req-' + Date.now());

    if (!overrideRequestId) {
      const tempUserMsg: AIMessage = {
        id: 'user-' + clientRequestId,
        role: 'USER',
        content: text.trim(),
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMsg]);
    }

    setIsLoading(true);

    try {
      const response = await aiService.sendMessage(text.trim(), conversationId, clientRequestId);

      if (response?.success && response?.message) {
        if (response.conversationId) {
          setConversationId(response.conversationId);
        }
        setMessages((prev) => [...prev, response.message!]);
      } else {
        // Provider failure / in-progress clean system message
        const sysErrMsg: AIMessage = {
          id: 'sys-err-' + Date.now(),
          role: 'ASSISTANT',
          content: response?.error || 'The AI service is currently unavailable. Please try again later.',
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, sysErrMsg]);
      }
    } catch (error: any) {
      const errorMessage: AIMessage = {
        id: 'err-' + Date.now(),
        role: 'ASSISTANT',
        content: 'The AI service is currently unavailable. Please try again later.',
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      isSendingRef.current = false;
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <AIChatButton isOpen={isOpen} onToggle={handleToggle} />

      {isOpen && (
        <AIChatWindow
          role={userRole}
          messages={messages}
          isLoading={isLoading}
          onSendMessage={handleSendMessage}
          onClose={() => setIsOpen(false)}
          onNewChat={handleNewChat}
        />
      )}
    </>
  );
};

export default AIAssistant;
