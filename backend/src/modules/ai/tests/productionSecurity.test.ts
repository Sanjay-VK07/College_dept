import { requireRoles } from '../../../middlewares/authMiddleware';
import { Role } from '@prisma/client';

describe('Phase 8 Production Security & RBAC Guard Tests', () => {
  it('should block Student role from accessing Admin endpoints', () => {
    const middleware = requireRoles(Role.ADMIN);
    const req: any = { user: { role: Role.STUDENT } };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: expect.stringContaining('Forbidden') })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should allow Admin role to access Admin endpoints', () => {
    const middleware = requireRoles(Role.ADMIN);
    const req: any = { user: { role: Role.ADMIN } };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
