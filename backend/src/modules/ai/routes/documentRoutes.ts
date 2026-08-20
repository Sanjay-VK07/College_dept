import { Router } from 'express';
import { DocumentController } from '../controllers/documentController';
import { documentUploadMiddleware } from '../middleware/documentUploadMiddleware';

const router = Router();

// Route for uploading documents (with file size limit validations)
router.post(
  '/upload',
  documentUploadMiddleware,
  DocumentController.handleMulterError,
  DocumentController.uploadDocument
);

// Route for listing and paginating accessible documents
router.get('/', DocumentController.listDocuments);

// Route for retrieving a specific document's metadata
router.get('/:documentId', DocumentController.getDocumentById);

// Route for downloading / streaming a document's file contents
router.get('/:documentId/download', DocumentController.downloadDocument);

// Route for deleting a document
router.delete('/:documentId', DocumentController.deleteDocument);

export default router;
