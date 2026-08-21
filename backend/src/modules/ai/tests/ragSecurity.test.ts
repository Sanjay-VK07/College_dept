import { RAGAdminController } from '../controllers/ragAdminController';
import { validateRAGThresholds, ENV } from '../../../config/env';

describe('RAG Security & Authorization Guard Tests', () => {
  it('should reject invalid RAG threshold configurations during application startup', () => {
    // Backup current thresholds
    const origMinSim = ENV.RAG_MIN_SIMILARITY;
    const origHigh = ENV.RAG_HIGH_CONFIDENCE_THRESHOLD;

    // Mutate to invalid state: MIN_SIMILARITY > HIGH_THRESHOLD
    (ENV as any).RAG_MIN_SIMILARITY = 0.95;
    (ENV as any).RAG_HIGH_CONFIDENCE_THRESHOLD = 0.70;

    expect(() => validateRAGThresholds()).toThrow('Invalid RAG Threshold Configuration');

    // Restore original valid configuration
    (ENV as any).RAG_MIN_SIMILARITY = origMinSim;
    (ENV as any).RAG_HIGH_CONFIDENCE_THRESHOLD = origHigh;

    expect(() => validateRAGThresholds()).not.toThrow();
  });

  it('should verify admin health endpoint executes without throwing unhandled errors', async () => {
    const mockReq: any = { user: { role: 'ADMIN' } };
    const mockRes: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await RAGAdminController.getHealth(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        status: expect.any(String),
        components: expect.any(Object),
      })
    );
  });
});
