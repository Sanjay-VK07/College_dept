import { prisma } from '../../../config/prisma';
import { Role, AIDocumentVisibility, AIDocumentStatus } from '@prisma/client';
import { DocumentService } from '../services/documentService';
import { documentStorageService } from '../services/documentStorageService';
import fs from 'fs';
import path from 'path';

async function runTests() {
  console.log('🧪 Starting Phase 2B Integration Test Suite...\n');

  // Retrieve seeded users
  const adminUser = await prisma.user.findFirst({ where: { role: Role.ADMIN } });
  const facultyUser = await prisma.user.findFirst({ where: { role: Role.FACULTY } });
  const studentUser = await prisma.user.findFirst({ where: { role: Role.STUDENT } });

  if (!adminUser || !facultyUser || !studentUser) {
    console.error('❌ Error: Seeded users (ADMIN, FACULTY, STUDENT) are required to run tests. Run npm run db:seed first.');
    process.exit(1);
  }

  let testCount = 0;
  let passCount = 0;

  function assert(condition: boolean, message: string) {
    testCount++;
    if (condition) {
      passCount++;
      console.log(`  ✅ PASS: ${message}`);
    } else {
      console.error(`  ❌ FAIL: ${message}`);
    }
  }

  // Helper buffers
  const validPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog ... >>\nendobj\n%%EOF');
  const spoofedPdfBuffer = Buffer.from('MZ\x90\x00\x03\x00\x00\x00'); // EXE header renamed to PDF
  const textBuffer = Buffer.from('Hello world standard text document');

  // ----------------------------------------------------
  // TEST 1: Authorized user uploads a valid PDF
  // ----------------------------------------------------
  try {
    const doc: any = await DocumentService.uploadDocument({
      fileBuffer: validPdfBuffer,
      fileName: 'test_syllabus.pdf',
      mimeType: 'application/pdf',
      title: 'Operating Systems Syllabus',
      visibility: AIDocumentVisibility.PRIVATE,
      userId: facultyUser.id,
      role: Role.FACULTY,
    });

    assert(doc !== null && doc.title === 'Operating Systems Syllabus', 'TEST 1: Upload valid PDF by authorized user');
    assert(doc.status === AIDocumentStatus.UPLOADED, 'TEST 1b: Initial status is strictly UPLOADED');
    assert(fs.existsSync(path.resolve(process.cwd(), 'uploads', 'ai-documents', doc.storageKey)), 'TEST 1c: File exists in local storage');

    // Clean up
    await DocumentService.deleteDocument({
      documentId: doc.id,
      userId: facultyUser.id,
      role: Role.FACULTY,
    });
  } catch (err: any) {
    assert(false, `TEST 1: Upload valid PDF failed with error: ${err.message}`);
  }

  // ----------------------------------------------------
  // TEST 2: Unauthorized role attempts upload
  // ----------------------------------------------------
  try {
    await DocumentService.uploadDocument({
      fileBuffer: validPdfBuffer,
      fileName: 'malicious.pdf',
      mimeType: 'application/pdf',
      title: 'Hack Syllabus',
      visibility: AIDocumentVisibility.PUBLIC,
      userId: studentUser.id,
      role: Role.STUDENT,
    });
    assert(false, 'TEST 2: Upload by STUDENT should have been rejected');
  } catch (err: any) {
    assert(err.message.includes('Forbidden') || err.message.includes('authorized'), 'TEST 2: Upload rejected for STUDENT role');
  }

  // ----------------------------------------------------
  // TEST 3: Oversized file
  // ----------------------------------------------------
  try {
    // Generate a buffer larger than MAX_DOCUMENT_UPLOAD_SIZE (e.g. 10MB + 1 byte)
    // To save memory in test, we can override or just mock a larger buffer, or since the default is 10MB,
    // let's pass an 11MB buffer.
    const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024);
    oversizedBuffer.write('%PDF-'); // write magic bytes at start
    await DocumentService.uploadDocument({
      fileBuffer: oversizedBuffer,
      fileName: 'huge.pdf',
      mimeType: 'application/pdf',
      title: 'Huge PDF file',
      userId: facultyUser.id,
      role: Role.FACULTY,
    });
    assert(false, 'TEST 3: Oversized file should have been rejected');
  } catch (err: any) {
    assert(err.message.includes('exceeds limit'), 'TEST 3: Rejection of oversized file');
  }

  // ----------------------------------------------------
  // TEST 4: Invalid extension/MIME
  // ----------------------------------------------------
  try {
    await DocumentService.uploadDocument({
      fileBuffer: textBuffer,
      fileName: 'script.sh',
      mimeType: 'application/x-sh',
      title: 'Shell Script',
      userId: facultyUser.id,
      role: Role.FACULTY,
    });
    assert(false, 'TEST 4: Invalid extension .sh should have been rejected');
  } catch (err: any) {
    assert(err.message.includes('Unsupported file extension'), 'TEST 4: Rejection of unsupported extension .sh');
  }

  // ----------------------------------------------------
  // TEST 5: Spoofed file (EXE renamed to PDF)
  // ----------------------------------------------------
  try {
    await DocumentService.uploadDocument({
      fileBuffer: spoofedPdfBuffer,
      fileName: 'spoofed.pdf',
      mimeType: 'application/pdf',
      title: 'Spoofed PDF',
      userId: facultyUser.id,
      role: Role.FACULTY,
    });
    assert(false, 'TEST 5: Spoofed PDF content should have been rejected');
  } catch (err: any) {
    assert(err.message.includes('signature validation failed'), 'TEST 5: Rejection of signature spoofed file');
  }

  // ----------------------------------------------------
  // TEST 6: User B requests User A's PRIVATE document
  // ----------------------------------------------------
  let docA: any = null;
  try {
    docA = await DocumentService.uploadDocument({
      fileBuffer: validPdfBuffer,
      fileName: 'user_a_private.pdf',
      mimeType: 'application/pdf',
      title: 'User A Private',
      visibility: AIDocumentVisibility.PRIVATE,
      userId: facultyUser.id,
      role: Role.FACULTY,
    });

    // Student attempts to read it
    await DocumentService.getDocumentById({
      documentId: docA.id,
      userId: studentUser.id,
      role: Role.STUDENT,
    });
    assert(false, 'TEST 6: Student should not access User A private document');
  } catch (err: any) {
    assert(err.message.includes('Access denied') || err.message.includes('permission'), 'TEST 6: Prevented cross-user access to PRIVATE document');
  }

  // ----------------------------------------------------
  // TEST 7: User B attempts download of User A's PRIVATE document
  // ----------------------------------------------------
  try {
    await DocumentService.getDownloadFilePath({
      documentId: docA.id,
      userId: studentUser.id,
      role: Role.STUDENT,
    });
    assert(false, 'TEST 7: Student should not download User A private document');
  } catch (err: any) {
    assert(err.message.includes('Access denied') || err.message.includes('permission'), 'TEST 7: Prevented unauthorized download of PRIVATE document');
  }

  // ----------------------------------------------------
  // TEST 8: Storage succeeds but database insertion is deliberately forced to fail
  // ----------------------------------------------------
  try {
    // We will bypass validation checks or trigger a DB error by supplying an invalid field or forcing a constraint violation.
    // An easy way to force Prisma create to fail is to supply an existing unique key or missing non-nullable field.
    // In Prisma, we can force failure by sending an invalid/missing non-nullable relation or empty database fields.
    // But since the upload flow parameters are strongly typed, let's trigger it by passing an extremely long title (e.g. 500 chars)
    // Wait, the service already validates title length before DB create, which is a service validation.
    // How can we trigger a DB-only failure?
    // What if we set `title` to a value that passes service validation but fails DB, or we mock/force database constraint?
    // Let's pass a storageKey that is already in use! Wait, storageKey has a `@unique` constraint in schema.prisma!
    // If we write a test helper that inserts a record with a specific storageKey, and then we try to upload a document that
    // gets the exact same storageKey, Prisma will throw a unique constraint violation error!
    // Let's test that!
    
    // First, let's find a way to mock/force it.
    // Or simpler, we can temporarily mock prisma.aIDocument.create to throw an error!
    const originalCreate = prisma.aIDocument.create;
    (prisma.aIDocument as any).create = async () => {
      throw new Error('Forced Prisma database creation failure.');
    };

    let storageKeyCaptured: string | null = null;
    // We override upload to capture the key
    const originalUpload = documentStorageService.upload;
    documentStorageService.upload = async (buf, name, mime) => {
      const key = await originalUpload.call(documentStorageService, buf, name, mime);
      storageKeyCaptured = key;
      return key;
    };

    try {
      await DocumentService.uploadDocument({
        fileBuffer: validPdfBuffer,
        fileName: 'force_fail.pdf',
        mimeType: 'application/pdf',
        title: 'Force Fail OS',
        userId: facultyUser.id,
        role: Role.FACULTY,
      });
      assert(false, 'TEST 8: Upload should have failed on database write');
    } catch (err: any) {
      assert(err.message.includes('Failed to save document metadata'), 'TEST 8: Graceful catch of database failure');
      
      // Verify storage key file was cleaned up (does not exist)
      if (storageKeyCaptured) {
        const fileExists = fs.existsSync(path.resolve(process.cwd(), 'uploads', 'ai-documents', storageKeyCaptured));
        assert(!fileExists, 'TEST 8b: Local storage file was cleaned up and is not orphaned');
      } else {
        assert(false, 'TEST 8b: Failed to capture storage key for cleanup verification');
      }
    } finally {
      // Restore originals
      prisma.aIDocument.create = originalCreate;
      documentStorageService.upload = originalUpload;
    }
  } catch (err: any) {
    assert(false, `TEST 8: Database failure simulation errored: ${err.message}`);
  }

  // ----------------------------------------------------
  // TEST 9: Unauthorized deletion attempt
  // ----------------------------------------------------
  try {
    await DocumentService.deleteDocument({
      documentId: docA.id,
      userId: studentUser.id,
      role: Role.STUDENT,
    });
    assert(false, 'TEST 9: Student should not delete faculty document');
  } catch (err: any) {
    assert(err.message.includes('Access denied') || err.message.includes('permission'), 'TEST 9: Rejected unauthorized deletion request');
  }

  // ----------------------------------------------------
  // TEST 10: Authorized deletion
  // ----------------------------------------------------
  try {
    const key = docA.storageKey;
    await DocumentService.deleteDocument({
      documentId: docA.id,
      userId: facultyUser.id,
      role: Role.FACULTY,
    });

    const dbRecord = await prisma.aIDocument.findUnique({ where: { id: docA.id } });
    const fileExists = fs.existsSync(path.resolve(process.cwd(), 'uploads', 'ai-documents', key));

    assert(dbRecord === null, 'TEST 10: Database record deleted');
    assert(!fileExists, 'TEST 10b: Local storage file deleted');
  } catch (err: any) {
    assert(false, `TEST 10: Deletion failed with error: ${err.message}`);
  }

  console.log(`\n📊 Integration Test Results: Passed ${passCount}/${testCount} tests.`);
  if (passCount !== testCount) {
    console.error('❌ Error: Some tests failed!');
    process.exit(1);
  } else {
    console.log('🎉 All tests passed successfully!');
    process.exit(0);
  }
}

runTests().catch((e) => {
  console.error('Unhandled test execution error:', e);
  process.exit(1);
});
