import { prisma } from '../../../config/prisma';
import { Role } from '@prisma/client';
import { AIIntent } from './intentService';

export interface AuthorizedContextParams {
  userId: string;
  role: Role;
  intent: AIIntent;
}

export interface VerifiedContextResponse {
  intent: AIIntent;
  verified: boolean;
  userSummary: {
    name: string;
    role: Role;
    department: string;
  };
  upcomingExams?: Array<{
    title: string;
    scheduledAt: string;
    durationMinutes: number;
  }>;
  completedExams?: Array<{
    title: string;
    score: number | string;
    totalMarks: number;
    completedAt: string;
  }>;
  performanceSummary?: {
    totalAttempted: number;
    overallAccuracy: string;
  };
  profileDetails?: {
    registerNo: string;
    department: string;
    semester: string;
    section: string;
  };
  attendanceSummary?: {
    minimumRequiredPercent: string;
    actualAttendance: string;
  };
  navigationGuide?: Array<{
    feature: string;
    location: string;
  }>;
}

export class ContextService {
  /**
   * Retrieves verified, minimal PostgreSQL context strictly scoped to authenticated user and intent
   */
  public static async getAuthorizedContext(
    params: AuthorizedContextParams
  ): Promise<VerifiedContextResponse> {
    const { userId, role, intent } = params;

    // Fetch basic authenticated user identity
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        role: true,
        department: true,
        registerNo: true,
        year: true,
        semester: true,
        section: true,
      },
    });

    if (!user) {
      throw new Error('Authenticated user record not found');
    }

    const baseContext: VerifiedContextResponse = {
      intent,
      verified: true,
      userSummary: {
        name: user.name,
        role: user.role,
        department: user.department,
      },
    };

    // If intent is GENERAL_KNOWLEDGE, do NOT attach private database records
    if (intent === 'GENERAL_KNOWLEDGE' || intent === 'UNKNOWN') {
      return baseContext;
    }

    // Role-specific authorized queries
    if (role === Role.STUDENT) {
      switch (intent) {
        case 'PORTAL_UPCOMING_EXAMS': {
          const assignments = await prisma.testAssignment.findMany({
            where: { studentId: userId, status: 'SCHEDULED' },
            take: 5,
            include: {
              test: {
                select: {
                  title: true,
                  startTime: true,
                  durationMinutes: true,
                },
              },
            },
          });

          baseContext.upcomingExams = assignments.map((a) => ({
            title: a.test?.title || 'Scheduled Mock Test',
            scheduledAt: a.test?.startTime ? new Date(a.test.startTime).toISOString() : 'Scheduled',
            durationMinutes: a.test?.durationMinutes || 180,
          }));
          break;
        }

        case 'PORTAL_EXAM_RESULT':
        case 'PORTAL_COMPLETED_EXAMS': {
          const completed = await prisma.testAssignment.findMany({
            where: {
              studentId: userId,
              status: { in: ['COMPLETED', 'AUTO_SUBMITTED'] },
            },
            take: 5,
            orderBy: { submittedAt: 'desc' },
            include: {
              test: {
                select: {
                  title: true,
                  totalMarks: true,
                },
              },
            },
          });

          baseContext.completedExams = completed.map((c) => ({
            title: c.test?.title || 'Completed Assessment',
            score: c.score !== null && c.score !== undefined ? c.score : '--',
            totalMarks: c.test?.totalMarks || 100,
            completedAt: c.submittedAt ? new Date(c.submittedAt).toISOString() : 'Submitted',
          }));
          break;
        }

        case 'PORTAL_PERFORMANCE': {
          const completedCount = await prisma.testAssignment.count({
            where: {
              studentId: userId,
              status: { in: ['COMPLETED', 'AUTO_SUBMITTED'] },
            },
          });

          baseContext.performanceSummary = {
            totalAttempted: completedCount,
            overallAccuracy: completedCount > 0 ? 'Evaluated in Analytics Tab' : '--',
          };
          break;
        }

        case 'PORTAL_ATTENDANCE': {
          const setting = await prisma.systemSetting.findUnique({
            where: { key: 'MIN_ATTENDANCE_REQUIREMENT' },
          });

          baseContext.attendanceSummary = {
            minimumRequiredPercent: setting ? `${setting.value}%` : '75%',
            actualAttendance: '--', // No attendance table exists in database
          };
          break;
        }

        case 'PORTAL_PROFILE': {
          baseContext.profileDetails = {
            registerNo: user.registerNo || 'N/A',
            department: user.department || 'N/A',
            semester: user.semester ? `Semester ${user.semester}` : 'N/A',
            section: user.section || 'N/A',
          };
          break;
        }

        case 'PORTAL_NAVIGATION': {
          baseContext.navigationGuide = [
            { feature: 'Upcoming Exams', location: 'Student Dashboard -> Overview & Ongoing' },
            { feature: 'Exam Results', location: 'Student Dashboard -> Semester Results' },
            { feature: 'Performance Analytics', location: 'Student Dashboard -> Analytics Tab' },
            { feature: 'Solution Review', location: 'Click "Review Solutions" on any completed test card' },
          ];
          break;
        }
      }
    } else if (role === Role.FACULTY) {
      if (intent === 'PORTAL_UPCOMING_EXAMS' || intent === 'PORTAL_COMPLETED_EXAMS') {
        const tests = await prisma.mockTest.findMany({
          where: { createdById: userId },
          take: 5,
          select: { title: true, startTime: true, durationMinutes: true, isPublished: true },
        });
        baseContext.upcomingExams = tests.map((t) => ({
          title: `${t.title} [${t.isPublished ? 'Published' : 'Draft'}]`,
          scheduledAt: t.startTime ? new Date(t.startTime).toISOString() : 'TBD',
          durationMinutes: t.durationMinutes,
        }));
      }
    }

    return baseContext;
  }
}
