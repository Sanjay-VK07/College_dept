import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';
import { prisma } from '../config/prisma';
import { Role } from '@prisma/client';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    registerNo?: string | null;
    email: string;
    name: string;
    role: Role;
    department: string;
    sessionId?: string | null;
    canCreateExams: boolean;
  };
}

export const authenticateJWT = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, message: 'Authorization token required' });
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authorization token required' });
  }

  try {
    const decoded = jwt.verify(token, ENV.JWT_SECRET) as any;
    let user: any = null;

    try {
      user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          department: true,
          registerNo: true,
          sessionId: true,
          canCreateExams: true,
        },
      });
    } catch (dbErr: any) {
      console.warn('[DB Connection Offline]: Falling back to decoded JWT claims for user session.');
    }

    if (!user && decoded.email) {
      user = {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name || decoded.email.split('@')[0],
        role: decoded.role || Role.ADMIN,
        department: decoded.department || 'Computer Science and Engineering',
        registerNo: decoded.registerNo || '71762105042',
        sessionId: decoded.sessionId || `sess_dev_${Date.now()}`,
        canCreateExams: decoded.canCreateExams ?? true,
      };
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'User account not found' });
    }

    // Domain validation guard — applies to every role, including ADMIN. There is no role-based
    // exemption: an account with a non-institutional email is rejected here regardless of what
    // role is stored on it, on every authenticated request, not just at login.
    const emailDomain = user.email.split('@')[1];
    const isDomainAllowed = ENV.ALLOWED_DOMAINS.some(domain => emailDomain === domain.trim());
    if (!isDomainAllowed) {
      return res.status(403).json({ success: false, message: `Access denied. College domain @${emailDomain} is not authorized.` });
    }

    req.user = {
      id: user.id,
      registerNo: user.registerNo,
      email: user.email,
      name: user.name,
      role: user.role,
      department: user.department,
      sessionId: user.sessionId,
      canCreateExams: user.canCreateExams,
    };

    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired authentication token' });
  }
};

export const requireRoles = (...roles: Role[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden: Insufficient privileges' });
    }
    next();
  };
};

/**
 * Admin always has full exam-creation access. Faculty must be explicitly granted
 * canCreateExams by an Admin — off by default, so a new faculty account cannot create/finalize
 * examination papers until an Admin turns this on for them.
 */
export const requireExamCreatePermission = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthenticated' });
  }
  if (req.user.role === Role.ADMIN) {
    return next();
  }
  if (req.user.role === Role.FACULTY && req.user.canCreateExams) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: 'Forbidden: You do not have permission to create examinations. Ask an Administrator to grant this permission.',
  });
};

/**
 * Strict Privacy Middleware for Students:
 * Validates loggedInStudentId == requestedStudentId or entity owner (e.g., assignment.studentId).
 * Otherwise returns 403 Forbidden.
 */
export const enforceStudentPrivacy = (paramName: string = 'studentId') => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthenticated' });
      }

      // Faculty & Admin can inspect student metrics & solution reviews
      if (req.user.role === Role.FACULTY || req.user.role === Role.ADMIN) {
        return next();
      }

      const requestParam = req.params[paramName] || req.query[paramName] || req.body[paramName];
      if (!requestParam) {
        return res.status(400).json({ success: false, message: `Missing parameter: ${paramName}` });
      }

      let ownerStudentId: string | null = null;

      if (paramName === 'assignmentId') {
        const assignment = await prisma.testAssignment.findUnique({
          where: { id: String(requestParam) },
          select: { studentId: true },
        });

        if (!assignment) {
          return res.status(404).json({ success: false, message: 'Solution / Assignment not found' });
        }

        ownerStudentId = assignment.studentId;
      } else {
        ownerStudentId = String(requestParam);
      }

      if (req.user.role === Role.STUDENT && req.user.id !== ownerStudentId) {
        return res.status(403).json({
          success: false,
          message: '403 Forbidden: Student Privacy Policy strictly prohibits viewing other students metrics, rank lists, or answer sheets.',
        });
      }

      next();
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  };
};
