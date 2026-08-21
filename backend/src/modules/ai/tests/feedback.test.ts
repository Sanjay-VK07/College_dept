import { FeedbackService } from '../services/feedbackService';
import { prisma } from '../../../config/prisma';
import { AIFeedbackRating } from '@prisma/client';

describe('FeedbackService Ownership & Isolation Tests', () => {
  const user1 = 'fb-user-1-' + Date.now();
  const user2 = 'fb-user-2-' + Date.now();
  const conv1 = 'fb-conv-1-' + Date.now();
  const conv2 = 'fb-conv-2-' + Date.now();
  const userMsg1 = 'fb-umsg-1-' + Date.now();
  const asstMsg1 = 'fb-[#1E40AF]-1-' + Date.now();
  const asstMsg2 = 'fb-[#1E40AF]-2-' + Date.now();

  beforeAll(async () => {
    // Create User 1 & User 2
    await prisma.user.createMany({
      data: [
        { id: user1, name: 'User One', email: `user1_${Date.now()}@cit.edu.in`, role: 'STUDENT', department: 'CSE' },
        { id: user2, name: 'User Two', email: `user2_${Date.now()}@cit.edu.in`, role: 'STUDENT', department: 'ECE' },
      ],
    });

    // Create Conversation 1 owned by User 1
    await prisma.aIConversation.create({
      data: { id: conv1, userId: user1, title: 'User 1 Conv' },
    });

    // Create Conversation 2 owned by User 2
    await prisma.aIConversation.create({
      data: { id: conv2, userId: user2, title: 'User 2 Conv' },
    });

    // Create Assistant Message in Conv 1 (owned by User 1)
    await prisma.aIMessage.create({
      data: {
        id: asstMsg1,
        conversationId: conv1,
        role: 'ASSISTANT',
        content: 'Assistant answer for User 1',
      },
    });

    // Create Assistant Message in Conv 2 (owned by User 2)
    await prisma.aIMessage.create({
      data: {
        id: asstMsg2,
        conversationId: conv2,
        role: 'ASSISTANT',
        content: 'Assistant answer for User 2',
      },
    });
  });

  afterAll(async () => {
    await prisma.aIConversation.deleteMany({ where: { id: { in: [conv1, conv2] } } });
    await prisma.user.deleteMany({ where: { id: { in: [user1, user2] } } });
  });

  it('should allow user to submit feedback for their own assistant message', async () => {
    const feedback = await FeedbackService.submitFeedback({
      messageId: asstMsg1,
      userId: user1,
      rating: AIFeedbackRating.HELPFUL,
      category: 'GOOD_ANSWER',
    });

    expect(feedback).toBeDefined();
    expect(feedback.messageId).toBe(asstMsg1);
    expect(feedback.userId).toBe(user1);
    expect(feedback.rating).toBe(AIFeedbackRating.HELPFUL);
  });

  it('should update existing feedback when submitted again by the same user (upsert)', async () => {
    const updatedFeedback = await FeedbackService.submitFeedback({
      messageId: asstMsg1,
      userId: user1,
      rating: AIFeedbackRating.NOT_HELPFUL,
      category: 'INCORRECT',
      comment: 'Mistake in step 2',
    });

    expect(updatedFeedback.rating).toBe(AIFeedbackRating.NOT_HELPFUL);
    expect(updatedFeedback.category).toBe('INCORRECT');
    expect(updatedFeedback.comment).toBe('Mistake in step 2');

    // Verify only ONE active feedback record exists for this [messageId, userId]
    const count = await prisma.aIFeedback.count({
      where: { messageId: asstMsg1, userId: user1 },
    });
    expect(count).toBe(1);
  });

  it('should strictly reject cross-user feedback submission with 403 Forbidden', async () => {
    // User 2 attempts submitting feedback for User 1's assistant message
    await expect(
      FeedbackService.submitFeedback({
        messageId: asstMsg1,
        userId: user2, // Cross-user attempt
        rating: AIFeedbackRating.NOT_HELPFUL,
      })
    ).rejects.toThrow('Forbidden');
  });
});
