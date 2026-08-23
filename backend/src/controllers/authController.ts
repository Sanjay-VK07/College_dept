import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';
import { prisma } from '../config/prisma';
import { AuditLogger } from '../services/auditLogger';
import { Role } from '@prisma/client';
import { NotificationController } from './notificationController';

export class AuthController {
  /**
   * Google Auth Login / Mock Login endpoint
   * Validates college domain e.g. @cit.edu.in
   */
  public static async googleLogin(req: Request, res: Response) {
    try {
      const { email, name, googleId, registerNo, role, department } = req.body;

      if (!email) {
        return res.status(400).json({ success: false, message: 'Email address is required' });
      }

      // Check Domain Restriction
      const emailDomain = email.split('@')[1];
      const isAllowed = ENV.ALLOWED_DOMAINS.some(d => d.trim().toLowerCase() === emailDomain?.toLowerCase());

      if (!isAllowed && role !== Role.ADMIN) {
        await NotificationController.createSystemNotification(
          'Login Attempt Failed',
          `Unauthorized login attempt for domain @${emailDomain} (${email})`,
          'error',
          'Admin'
        );

        return res.status(403).json({
          success: false,
          message: `Access Denied: Domain '@${emailDomain}' is not an authorized college email domain. Please use your official college account (@cit.edu.in).`,
        });
      }

      // Find or create user
      let user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        user = await prisma.user.create({
          data: {
            email,
            name: name || email.split('@')[0],
            googleId: googleId || `g_${Date.now()}`,
            role: role || Role.STUDENT,
            department: department || 'Computer Science and Engineering',
            registerNo: registerNo || (role === Role.STUDENT ? `717621050${Date.now().toString().slice(-3)}` : null),
            year: 3,
            semester: 6,
            section: 'A',
          },
        });
      }

      // Generate Session Lock ID
      const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      await prisma.user.update({
        where: { id: user.id },
        data: { sessionId },
      });

      // Issue JWT Token
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
          sessionId,
        },
        ENV.JWT_SECRET,
        { expiresIn: '12h' }
      );

      // Audit Log Entry
      await AuditLogger.log({
        userId: user.id,
        action: 'USER_LOGIN',
        resource: 'User',
        details: `${user.name} (${user.role}) signed in successfully`,
        ipAddress: req.ip,
      });

      await NotificationController.createSystemNotification(
        'Login Successful',
        `User ${user.name} (${user.role}) logged in successfully`,
        'info',
        user.role,
        user.id
      );

      const userResponse = {
        id: user.id,
        registerNo: user.registerNo,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        year: user.year,
        semester: user.semester,
        section: user.section,
        avatar: user.avatar,
      };

      return res.status(200).json({
        success: true,
        message: 'Authentication successful',
        token,
        user: userResponse,
        data: {
          token,
          user: userResponse,
        },
      });
    } catch (error: any) {
      console.error('[AuthController.googleLogin Error]:', error?.message || error);
      if (error?.code === 'P2024' || error?.message?.includes('Timed out fetching a new connection')) {
        return res.status(503).json({
          success: false,
          code: 'DATABASE_POOL_EXHAUSTED',
          message: 'Database is temporarily busy. Please try again.',
        });
      }
      return res.status(500).json({ success: false, message: 'Authentication failed. Please try again.' });
    }
  }

  public static async getProfile(req: any, res: Response) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          registerNo: true,
          name: true,
          email: true,
          role: true,
          department: true,
          year: true,
          semester: true,
          section: true,
          avatar: true,
          createdAt: true,
        },
      });

      const attendanceSetting = await prisma.systemSetting.findUnique({
        where: { key: 'MIN_ATTENDANCE_REQUIREMENT' },
      });

      return res.status(200).json({
        success: true,
        data: {
          ...user,
          minAttendanceRequirement: attendanceSetting ? attendanceSetting.value : null,
        },
      });
    } catch (error: any) {
      console.error('[AuthController.getProfile Error]:', error?.message || error);
      if (error?.code === 'P2024' || error?.message?.includes('Timed out fetching a new connection')) {
        return res.status(503).json({
          success: false,
          code: 'DATABASE_POOL_EXHAUSTED',
          message: 'Database is temporarily busy. Please try again.',
        });
      }
      return res.status(500).json({ success: false, message: 'Unable to fetch user profile.' });
    }
  }
}
