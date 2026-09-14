import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { ENV } from '../config/env';
import { prisma } from '../config/prisma';
import { AuditLogger } from '../services/auditLogger';
import { Role } from '@prisma/client';
import { NotificationController } from './notificationController';

const googleClient = ENV.GOOGLE_CLIENT_ID ? new OAuth2Client(ENV.GOOGLE_CLIENT_ID) : null;

export class AuthController {
  /**
   * Google Auth Login endpoint
   *
   * SECURITY: role is NEVER accepted from the request body, in either code path below. A brand
   * new account created through this endpoint is always provisioned as STUDENT — FACULTY and
   * ADMIN accounts can only come from the authorized server-side provisioning endpoints
   * (POST /admin/faculty, PUT /admin/users/:id/role), never from self-service login. An existing
   * account's role always comes from its stored database row, never from this request.
   *
   * Two identity paths:
   *  - Verified: if GOOGLE_CLIENT_ID is configured and the client sends a real Google ID token
   *    (`googleIdToken`), it is cryptographically verified via google-auth-library and the email
   *    is read from the verified token payload — the client-supplied email is ignored entirely.
   *  - Institutional self-service fallback (current UI, no verified identity provider wired up
   *    yet): the client-asserted email is trusted only insofar as it must match an allowed
   *    college domain, checked unconditionally for every account — there is no role-based
   *    exemption from this check.
   */
  public static async googleLogin(req: Request, res: Response) {
    try {
      const { registerNo, department, googleIdToken } = req.body;

      let email: string;
      let name: string;
      let googleId: string;
      let verifiedIdentity = false;

      if (googleClient && googleIdToken) {
        let ticket;
        try {
          ticket = await googleClient.verifyIdToken({ idToken: googleIdToken, audience: ENV.GOOGLE_CLIENT_ID });
        } catch (err: any) {
          return res.status(401).json({ success: false, message: 'Invalid or expired Google sign-in token.' });
        }
        const payload = ticket.getPayload();
        if (!payload?.email || !payload.email_verified) {
          return res.status(401).json({ success: false, message: 'Google account email is not verified.' });
        }
        email = payload.email;
        name = payload.name || email.split('@')[0];
        googleId = payload.sub;
        verifiedIdentity = true;
      } else {
        const bodyEmail = req.body.email;
        if (!bodyEmail) {
          return res.status(400).json({ success: false, message: 'Email address is required' });
        }
        email = bodyEmail;
        name = req.body.name || email.split('@')[0];
        googleId = req.body.googleId || `g_${Date.now()}`;
      }

      // Check Domain Restriction — applies unconditionally to every account, including ADMIN.
      // There must be no role-based way to bypass this: role is not even read at this point.
      const emailDomain = email.split('@')[1];
      const isAllowed = ENV.ALLOWED_DOMAINS.some(d => d.trim().toLowerCase() === emailDomain?.toLowerCase());

      if (!isAllowed) {
        await NotificationController.createSystemNotification(
          'Login Attempt Failed',
          `Unauthorized login attempt for domain @${emailDomain} (${email})`,
          'error',
          'Admin'
        );

        return res.status(403).json({
          success: false,
          message: `Access Denied: Domain '@${emailDomain}' is not an authorized college email domain. Please use your official college account (@citchennai.net).`,
        });
      }

      // Find or create user. Role is intentionally never sourced from the request body: an
      // existing user keeps whatever role is already on their row (below), and a brand new user
      // is always created as STUDENT — there is no field in this request that can change that.
      let user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        user = await prisma.user.create({
          data: {
            email,
            name,
            googleId,
            role: Role.STUDENT,
            department: department || 'Computer Science and Engineering',
            registerNo: registerNo || `717621050${Date.now().toString().slice(-3)}`,
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
        details: `${user.name} (${user.role}) signed in successfully${verifiedIdentity ? ' [verified Google identity]' : ' [institutional self-service login]'}`,
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
        canCreateExams: user.canCreateExams,
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
          canCreateExams: true,
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
