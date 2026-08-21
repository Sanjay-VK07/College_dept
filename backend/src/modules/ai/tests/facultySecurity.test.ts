import { FacultyIntelligenceController } from '../controllers/facultyIntelligenceController';
import { Role } from '@prisma/client';

describe('Faculty Security & RBAC Guard Tests', () => {
  it('should strictly reject Student role from accessing intelligence overview with 403 Forbidden', async () => {
    const req: any = {
      user: { id: 'student-id-123', role: Role.STUDENT },
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await FacultyIntelligenceController.getOverview(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: expect.stringContaining('Forbidden') })
    );
  });
});
