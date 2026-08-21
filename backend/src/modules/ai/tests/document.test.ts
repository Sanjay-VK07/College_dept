import { prisma } from '../../../config/prisma';
import { Role, AIDocumentVisibility, AIDocumentStatus } from '@prisma/client';
import { DocumentService } from '../services/documentService';
import { documentStorageService } from '../services/documentStorageService';
import fs from 'fs';
import path from 'path';

describe('Phase 2B Document Service Integration Tests', () => {
  it('should run document management upload, download, and deletion pipeline', async () => {
    // Retrieve seeded or existing users
    let adminUser = await prisma.user.findFirst({ where: { role: Role.ADMIN } });
    let facultyUser = await prisma.user.findFirst({ where: { role: Role.FACULTY } });
    let studentUser = await prisma.user.findFirst({ where: { role: Role.STUDENT } });

    if (!facultyUser) {
      facultyUser = await prisma.user.create({
        data: { id: 'doc-fac-1', name: 'Fac One', email: 'fac1_doc@cit.edu.in', role: 'FACULTY', department: 'CSE' },
      });
    }

    if (!studentUser) {
      studentUser = await prisma.user.create({
        data: { id: 'doc-stud-1', name: 'Stud One', email: 'stud1_doc@cit.edu.in', role: 'STUDENT', department: 'CSE' },
      });
    }

    const validPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog ... >>\nendobj\n%%EOF');

    // 1. Authorized upload
    const doc = await DocumentService.uploadDocument({
      fileBuffer: validPdfBuffer,
      fileName: 'test_syllabus.pdf',
      mimeType: 'application/pdf',
      title: 'Operating Systems Syllabus',
      visibility: AIDocumentVisibility.PRIVATE,
      userId: facultyUser.id,
      role: Role.FACULTY,
    });

    expect(doc).toBeDefined();
    expect(doc.title).toBe('Operating Systems Syllabus');
    expect(doc.status).toBe(AIDocumentStatus.UPLOADED);

    // 2. Unauthorized Student Access Rejection
    await expect(
      DocumentService.getDocumentById({
        documentId: doc.id,
        userId: studentUser.id,
        role: Role.STUDENT,
      })
    ).rejects.toThrow('Access denied');

    // 3. Authorized Deletion
    await DocumentService.deleteDocument({
      documentId: doc.id,
      userId: facultyUser.id,
      role: Role.FACULTY,
    });

    const deletedDoc = await prisma.aIDocument.findUnique({ where: { id: doc.id } });
    expect(deletedDoc).toBeNull();
  });
});
