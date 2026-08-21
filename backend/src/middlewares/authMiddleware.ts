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
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        department: true,
        registerNo: true,
        sessionId: true,
      },
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'User account not found' });
    }

    // Domain validation guard
    const emailDomain = user.email.split('@')[1];
    const isDomainAllowed = ENV.ALLOWED_DOMAINS.some(domain => emailDomain === domain.trim());
    if (!isDomainAllowed && user.role !== Role.ADMIN) {
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

      // Detailed logging for development diagnostic tracking
      console.log({
        loggedInUserId: req.user.id,
        requestParam: requestParam,
        solutionOwnerId: ownerStudentId,
      });

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
