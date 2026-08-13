import { prisma } from '../config/prisma';

export class AuditLogger {
  public static async log(params: {
    userId?: string;
    action: string;
    resource: string;
    details?: string;
    ipAddress?: string;
  }) {
    try {
      await prisma.auditLog.create({
        data: {
          userId: params.userId || null,
          action: params.action,
          resource: params.resource,
          details: params.details || null,
          ipAddress: params.ipAddress || null,
        },
      });
    } catch (error) {
      console.error('Failed to write AuditLog entry:', error);
    }
  }
}
