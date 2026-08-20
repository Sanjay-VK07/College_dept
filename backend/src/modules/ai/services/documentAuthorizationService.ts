import { Role, AIDocumentVisibility, AIDocument } from '@prisma/client';

export class DocumentAuthorizationService {
  /**
   * Checks if a user has permission to upload documents.
   */
  public static canUpload(role: Role): boolean {
    // Only Admin and Faculty can upload documents
    return role === Role.ADMIN || role === Role.FACULTY;
  }

  /**
   * Checks if a user has permission to delete a specific document.
   */
  public static canDelete(userId: string, role: Role, document: AIDocument): boolean {
    if (role === Role.ADMIN) return true;
    
    // Faculty can delete their own uploaded documents
    if (role === Role.FACULTY && document.uploadedById === userId) {
      return true;
    }

    return false;
  }

  /**
   * Checks if a user has permission to access (view/download) a specific document.
   */
  public static canAccess(userId: string, role: Role, document: AIDocument): boolean {
    if (role === Role.ADMIN) return true;

    // Public documents are accessible to all authenticated users
    if (document.visibility === AIDocumentVisibility.PUBLIC) {
      return true;
    }

    // Private documents are only accessible to their owner
    if (document.visibility === AIDocumentVisibility.PRIVATE && document.uploadedById === userId) {
      return true;
    }

    return false;
  }

  /**
   * Returns a Prisma where clause for filtering documents based on user visibility permissions.
   */
  public static getVisibilityFilter(userId: string, role: Role) {
    if (role === Role.ADMIN) {
      // Admin can see everything
      return {};
    }

    // Faculty and Student see all PUBLIC documents, or their own PRIVATE documents
    return {
      OR: [
        { visibility: AIDocumentVisibility.PUBLIC },
        { uploadedById: userId },
      ],
    };
  }
}
