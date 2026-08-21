import { AIGovernanceController } from '../controllers/aiGovernanceController';
import { Role } from '@prisma/client';

describe('AI Governance Security & RBAC Guard Tests', () => {
  it('should strictly reject non-Admin roles from governance endpoints with 403 Forbidden', async () => {
    const req: any = {
      user: { id: 'student-123', role: Role.STUDENT },
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await AIGovernanceController.getOverview(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: expect.stringContaining('Forbidden') })
    );
  });

  it('should strictly reject Faculty role from circuit breaker toggle with 403 Forbidden', async () => {
    const req: any = {
      user: { id: 'faculty-123', role: Role.FACULTY },
      body: { open: true },
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await AIGovernanceController.setCircuitBreaker(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
