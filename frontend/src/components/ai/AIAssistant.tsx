'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { AIChatButton } from './AIChatButton';
import { AIChatWindow } from './AIChatWindow';
import { aiService, AIMessage } from '@/services/aiService';

export const AIAssistant: React.FC = () => {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [userRole, setUserRole] = useState<string>('STUDENT');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // In-flight request lock to prevent race conditions and rapid duplicate submissions
  const isSendingRef = useRef<boolean>(false);

  // Check auth and user role from localStorage, reacting to route transitions and storage events
  const syncAuthState = () => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('gsmas_token') || localStorage.getItem('token');
    const storedUserStr = localStorage.getItem('gsmas_user') || localStorage.getItem('user');

    if (token) {
      setIsAuthenticated(true);
      if (storedUserStr) {
        try {
          const userObj = JSON.parse(storedUserStr);
          if (userObj?.role) {
            setUserRole(userObj.role);
          }
        } catch (e) {}
      }
    } else {
      setIsAuthenticated(false);
    }
  };

  useEffect(() => {
    syncAuthState();

    const handleStorageChange = () => syncAuthState();
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('auth-change', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('auth-change', handleStorageChange);
    };
  }, [pathname]);

  // Optionally hydrate previous conversation when the chat window opens
  useEffect(() => {
    if (isOpen && messages.length === 0 && isAuthenticated) {
      aiService
        .getConversations()
        .then((convs) => {
          if (convs && convs.length > 0) {
            const latestConv = convs[0];
            aiService
              .getConversation(latestConv.id)
              .then((convData) => {
                if (convData && convData.messages && convData.messages.length > 0) {
                  setConversationId(convData.id);
                  setMessages(convData.messages);
                }
              })
              .catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, [isOpen, isAuthenticated]);

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
        const incomingMsg: AIMessage = {
          ...response.message,
          action: response.message.action || response.action,
        };
        setMessages((prev) => [...prev, incomingMsg]);
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

  // Hide the floating chatbot on the unauthenticated login page or during an active student exam session
  if (
    !isAuthenticated ||
    !pathname ||
    pathname === '/' ||
    pathname === '/login' ||
    pathname.startsWith('/student/exam')
  ) {
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
