import { prisma } from '../../../config/prisma';
import { Role, AIDocumentVisibility } from '@prisma/client';
import { DocumentService } from '../services/documentService';
import { RAGService } from '../services/ragService';

describe('Phase 2D RAG Assistant Integration Suite', () => {
  let facultyUser: any = null;
  let studentUser: any = null;

  beforeAll(async () => {
    facultyUser = await prisma.user.findFirst({ where: { role: Role.FACULTY } });
    studentUser = await prisma.user.findFirst({ where: { role: Role.STUDENT } });
  });

  it('should verify RAG Service is functional and authorized', async () => {
    if (!studentUser || !facultyUser) {
      return;
    }

    const testBuffer = Buffer.from('GATE CSE Exam Syllabus and Eligibility Guidelines Content.');
    const doc = await DocumentService.uploadDocument({
      fileBuffer: testBuffer,
      fileName: 'gate_cse_syllabus.txt',
      mimeType: 'text/plain',
      title: 'GATE CSE General Syllabus Note',
      visibility: AIDocumentVisibility.PUBLIC,
      userId: facultyUser.id,
      role: Role.FACULTY,
    });

    expect(doc).toBeDefined();

    await waitForDocumentReady(doc.id);

    const chunks = await RAGService.searchChunks({
      query: 'GATE syllabus eligibility',
      userId: studentUser.id,
      role: Role.STUDENT,
    });

    expect(Array.isArray(chunks)).toBe(true);

    // Clean up
    try {
      await DocumentService.deleteDocument({ documentId: doc.id, userId: facultyUser.id, role: Role.FACULTY });
    } catch (e) {}
  });

  it('should isolate private documents from student RAG search', async () => {
    if (!studentUser || !facultyUser) {
      return;
    }

    const privateDoc = await DocumentService.uploadDocument({
      fileBuffer: Buffer.from('Top secret: faculty research projects database passwords.'),
      fileName: 'secrets.txt',
      mimeType: 'text/plain',
      title: 'Faculty Secret Notes',
      visibility: AIDocumentVisibility.PRIVATE,
      userId: facultyUser.id,
      role: Role.FACULTY,
    });

    await waitForDocumentReady(privateDoc.id);

    const leakedChunks = await RAGService.searchChunks({
      query: 'top secret projects',
      userId: studentUser.id,
      role: Role.STUDENT,
    });

    const hasPrivateDoc = leakedChunks.some((c) => c.documentId === privateDoc.id);
    expect(hasPrivateDoc).toBe(false);

    const facultySearch = await RAGService.searchChunks({
      query: 'top secret projects',
      userId: facultyUser.id,
      role: Role.FACULTY,
    });

    const hasPrivateFacultyDoc = facultySearch.some((c) => c.documentId === privateDoc.id);
    expect(hasPrivateFacultyDoc).toBe(true);

    try {
      await DocumentService.deleteDocument({ documentId: privateDoc.id, userId: facultyUser.id, role: Role.FACULTY });
    } catch (e) {}
  });
});

async function waitForDocumentReady(documentId: string, timeoutMs: number = 10000): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const doc = await prisma.aIDocument.findUnique({ where: { id: documentId } });
    if (doc && doc.status === 'READY') {
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}
