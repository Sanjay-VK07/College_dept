import { Response } from 'express';
import { AuthRequest } from '../../../middlewares/authMiddleware';
import { DocumentService } from '../services/documentService';
import { AIDocumentVisibility } from '@prisma/client';
import multer from 'multer';

export class DocumentController {
  /**
   * Handles POST /api/ai/documents/upload
   */
  public static async uploadDocument(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthenticated.' });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded. Please upload a file.' });
      }

      const { title, visibility } = req.body;

      // Validate visibility if provided
      let docVisibility: AIDocumentVisibility = AIDocumentVisibility.PRIVATE;
      if (visibility) {
        if (visibility === 'PUBLIC' || visibility === 'PRIVATE') {
          docVisibility = visibility as AIDocumentVisibility;
        } else {
          return res.status(400).json({
            success: false,
            message: 'Invalid visibility value. Must be either PUBLIC or PRIVATE.',
          });
        }
      }

      const document = await DocumentService.uploadDocument({
        fileBuffer: req.file.buffer,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        title,
        visibility: docVisibility,
        userId: req.user.id,
        role: req.user.role,
      });

      return res.status(201).json({
        success: true,
        message: 'Document uploaded successfully.',
        data: {
          id: document.id,
          title: document.title,
          fileName: document.fileName,
          mimeType: document.mimeType,
          fileSize: document.fileSize,
          visibility: document.visibility,
          status: document.status,
          createdAt: document.createdAt,
        },
      });
    } catch (err: any) {
      console.error('Controller error in uploadDocument:', err.message);
      const status = err.message.includes('Forbidden')
        ? 403
        : err.message.includes('limit') || err.message.includes('required') || err.message.includes('Invalid') || err.message.includes('mismatch') || err.message.includes('spoof')
        ? 400
        : 500;
      
      const cleanMessage = status === 500 ? 'An unexpected error occurred during file upload.' : err.message;
      return res.status(status).json({ success: false, message: cleanMessage });
    }
  }

  /**
   * Handles GET /api/ai/documents
   */
  public static async listDocuments(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthenticated.' });
      }

      const { page, limit, visibility, search } = req.query;

      // Validate pagination
      const parsedPage = page ? parseInt(String(page), 10) : 1;
      const parsedLimit = limit ? parseInt(String(limit), 10) : 10;

      if (isNaN(parsedPage) || parsedPage <= 0) {
        return res.status(400).json({ success: false, message: 'Page parameter must be a positive integer.' });
      }
      if (isNaN(parsedLimit) || parsedLimit <= 0 || parsedLimit > 100) {
        return res.status(400).json({ success: false, message: 'Limit parameter must be a positive integer <= 100.' });
      }

      // Validate visibility query filter
      let docVisibility: AIDocumentVisibility | undefined = undefined;
      if (visibility) {
        if (visibility === 'PUBLIC' || visibility === 'PRIVATE') {
          docVisibility = visibility as AIDocumentVisibility;
        } else {
          return res.status(400).json({
            success: false,
            message: 'Invalid visibility query filter. Must be PUBLIC or PRIVATE.',
          });
        }
      }

      const result = await DocumentService.listDocuments({
        userId: req.user.id,
        role: req.user.role,
        page: parsedPage,
        limit: parsedLimit,
        visibility: docVisibility,
        search: search ? String(search) : undefined,
      });

      return res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (err: any) {
      console.error('Controller error in listDocuments:', err.message);
      return res.status(500).json({ success: false, message: 'An unexpected error occurred while retrieving documents.' });
    }
  }

  /**
   * Handles GET /api/ai/documents/:documentId
   */
  public static async getDocumentById(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthenticated.' });
      }

      const { documentId } = req.params;
      if (!documentId) {
        return res.status(400).json({ success: false, message: 'Document ID parameter is required.' });
      }

      const document = await DocumentService.getDocumentById({
        documentId,
        userId: req.user.id,
        role: req.user.role,
      });

      return res.status(200).json({
        success: true,
        data: {
          id: document.id,
          title: document.title,
          fileName: document.fileName,
          mimeType: document.mimeType,
          fileSize: document.fileSize,
          visibility: document.visibility,
          status: document.status,
          createdAt: document.createdAt,
          updatedAt: document.updatedAt,
        },
      });
    } catch (err: any) {
      console.error('Controller error in getDocumentById:', err.message);
      const status = err.message.includes('Access denied')
        ? 403
        : err.message.includes('not found')
        ? 404
        : 500;
      
      const cleanMessage = status === 500 ? 'An unexpected error occurred while loading document.' : err.message;
      return res.status(status).json({ success: false, message: cleanMessage });
    }
  }

  /**
   * Handles GET /api/ai/documents/:documentId/download
   */
  public static async downloadDocument(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthenticated.' });
      }

      const { documentId } = req.params;
      if (!documentId) {
        return res.status(400).json({ success: false, message: 'Document ID parameter is required.' });
      }

      const { filePath, fileName, mimeType } = await DocumentService.getDownloadFilePath({
        documentId,
        userId: req.user.id,
        role: req.user.role,
      });

      // Stream file to client securely
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
      return res.sendFile(filePath);
    } catch (err: any) {
      console.error('Controller error in downloadDocument:', err.message);
      const status = err.message.includes('Access denied')
        ? 403
        : err.message.includes('not found')
        ? 404
        : 500;
      
      const cleanMessage = status === 500 ? 'An unexpected error occurred while downloading file.' : err.message;
      return res.status(status).json({ success: false, message: cleanMessage });
    }
  }

  /**
   * Handles DELETE /api/ai/documents/:documentId
   */
  public static async deleteDocument(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthenticated.' });
      }

      const { documentId } = req.params;
      if (!documentId) {
        return res.status(400).json({ success: false, message: 'Document ID parameter is required.' });
      }

      await DocumentService.deleteDocument({
        documentId,
        userId: req.user.id,
        role: req.user.role,
      });

      return res.status(200).json({
        success: true,
        message: 'Document deleted successfully.',
      });
    } catch (err: any) {
      console.error('Controller error in deleteDocument:', err.message);
      const status = err.message.includes('Access denied')
        ? 403
        : err.message.includes('not found')
        ? 404
        : 500;
      
      const cleanMessage = status === 500 ? 'An unexpected error occurred while deleting document.' : err.message;
      return res.status(status).json({ success: false, message: cleanMessage });
    }
  }

  /**
   * Express error handler helper for multer upload limits
   */
  public static handleMulterError(err: any, req: any, res: any, next: any) {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        const sizeMb = (parseInt(process.env.MAX_DOCUMENT_UPLOAD_SIZE || '10485760', 10) / (1024 * 1024)).toFixed(0);
        return res.status(400).json({
          success: false,
          message: `File size exceeds limit of ${sizeMb}MB.`,
        });
      }
      return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
    }
    next(err);
  }
}
