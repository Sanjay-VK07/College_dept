import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { prisma } from '../config/prisma';
import { broadcastNotification } from '../socket/invigilatorHub';

export class NotificationController {
  // Helper method to create notifications from backend handlers
  public static async createSystemNotification(
    title: string,
    message: string,
    type: 'info' | 'success' | 'warning' | 'error' = 'info',
    role: string = 'ALL',
    userId?: string
  ) {
    try {
      const notif = await prisma.notification.create({
        data: {
          title,
          message,
          type,
          role,
          userId: userId || null,
        },
      });
      broadcastNotification(notif);
    } catch (error) {
      console.error('Error creating notification:', error);
    }
  }

  // GET /api/notifications/unread-count
  public static async getUnreadCount(req: AuthRequest, res: Response) {
    try {
      const userRole = req.user?.role || 'STUDENT';
      const userId = req.user?.id;

      const unreadCount = await prisma.notification.count({
        where: {
          isRead: false,
          OR: [
            { role: 'ALL' },
            { role: { equals: userRole, mode: 'insensitive' } },
            { userId: userId || undefined },
          ],
        },
      });

      return res.status(200).json({
        success: true,
        data: { unreadCount },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: 'Failed to count unread notifications.',
      });
    }
  }

  // GET /api/notifications
  public static async getNotifications(req: AuthRequest, res: Response) {
    try {
      const userRole = req.user?.role || 'STUDENT';
      const userId = req.user?.id;

      let notifications: any[] = [];
      try {
        const dbPromise = prisma.notification.findMany({
          where: {
            OR: [
              { role: 'ALL' },
              { role: { equals: userRole, mode: 'insensitive' } },
              { userId: userId || undefined },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: 30,
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('DB Timeout')), 1500)
        );

        notifications = (await Promise.race([dbPromise, timeoutPromise])) as any[];
      } catch (dbErr) {
        console.warn('[DB Connection Offline]: Returning empty notifications list for development session.');
      }

      const unreadCount = notifications.filter((n: any) => !n.isRead).length;

      return res.status(200).json({
        success: true,
        data: {
          notifications,
          unreadCount,
        },
      });
    } catch (error: any) {
      console.error('Error fetching notifications:', error);
      return res.status(200).json({
        success: true,
        data: { notifications: [], unreadCount: 0 },
      });
    }
  }

  // PUT /api/notifications/:id/read
  public static async markAsRead(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      await prisma.notification.update({
        where: { id },
        data: { isRead: true },
      });

      return res.status(200).json({
        success: true,
        message: 'Notification marked as read.',
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update notification.',
      });
    }
  }

  // PUT /api/notifications/read-all
  public static async markAllAsRead(req: AuthRequest, res: Response) {
    try {
      const userRole = req.user?.role || 'STUDENT';
      const userId = req.user?.id;

      await prisma.notification.updateMany({
        where: {
          isRead: false,
          OR: [
            { role: 'ALL' },
            { role: { equals: userRole, mode: 'insensitive' } },
            { userId: userId || undefined },
          ],
        },
        data: { isRead: true },
      });

      return res.status(200).json({
        success: true,
        message: 'All notifications marked as read.',
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: 'Failed to mark all notifications as read.',
      });
    }
  }

  // DELETE /api/notifications/:id
  public static async deleteNotification(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      await prisma.notification.delete({
        where: { id },
      });

      return res.status(200).json({
        success: true,
        message: 'Notification deleted.',
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete notification.',
      });
    }
  }
}
