import { documentStorageService, LocalStorageProvider } from '../services/documentStorageService';
import { DocumentService } from '../services/documentService';
import { prisma } from '../../../config/prisma';

describe('Document Storage Integrity & Diagnostics Tests', () => {
  let testUserId: string;

  beforeAll(async () => {
    const user = await prisma.user.upsert({
      where: { email: 'storage_test_user@cit.edu.in' },
      update: {},
      create: {
        name: 'Storage Test User',
        email: 'storage_test_user@cit.edu.in',
        role: 'ADMIN',
        department: 'CSE',
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    await prisma.aIDocument.deleteMany({ where: { uploadedById: testUserId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
  });

  it('should return true for existing file and false for missing storage key', async () => {
    const fakeKey = 'non_existent_folder/missing_file.pdf';
    const exists = await documentStorageService.fileExists(fakeKey);
    expect(exists).toBe(false);
  });

  it('should throw DOCUMENT_STORAGE_MISSING when downloading a document with missing physical file', async () => {
    const doc = await prisma.aIDocument.create({
      data: {
        title: 'Missing File Test Document',
        fileName: 'missing.pdf',
        mimeType: 'application/pdf',
        visibility: 'PRIVATE',
        status: 'READY',
        storageKey: 'missing_folder/missing_file.pdf',
        uploadedById: testUserId,
      },
    });

    await expect(
      DocumentService.getDownloadFilePath({
        documentId: doc.id,
        userId: testUserId,
        role: 'ADMIN' as any,
      })
    ).rejects.toThrow('DOCUMENT_STORAGE_MISSING');
  });

  it('should detect orphan documents where DB record exists but physical file is missing', async () => {
    const doc = await prisma.aIDocument.create({
      data: {
        title: 'Orphan Diagnostic Test Document',
        fileName: 'orphan.pdf',
        mimeType: 'application/pdf',
        visibility: 'PRIVATE',
        status: 'READY',
        storageKey: `orphan_test_${Date.now()}/orphan.pdf`,
        uploadedById: testUserId,
      },
    });

    const fileExists = await documentStorageService.fileExists(doc.storageKey);
    expect(fileExists).toBe(false);
  });
});
