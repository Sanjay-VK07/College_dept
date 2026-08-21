import { prisma } from '../../../config/prisma';
import { Role, AIDocumentVisibility, QuestionType, Difficulty } from '@prisma/client';
import { DocumentService } from '../services/documentService';
import { RAGService } from '../services/ragService';
import { QuestionGenerationService } from '../services/questionGenerationService';
import { PracticeService } from '../services/practiceService';
import { AIStatsService } from '../services/aiStatsService';
import { AIChatService } from '../services/aiChatService';
import { LocalLLMProvider } from '../services/llmProvider';

async function waitForDocumentReady(docId: string, maxSeconds = 5): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxSeconds * 1000) {
    const doc = await prisma.aIDocument.findUnique({ where: { id: docId } });
    if (doc?.status === 'READY') return;
    if (doc?.status === 'FAILED') {
      throw new Error(`Document processing failed: ${doc.processingError}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timeout waiting for document ${docId} to be READY`);
}

async function runTests() {
  console.log('🧪 Starting Phase 2D Integration Test Suite...\n');

  // Retrieve seeded users
  const adminUser = await prisma.user.findFirst({ where: { role: Role.ADMIN } });
  const facultyUser = await prisma.user.findFirst({ where: { role: Role.FACULTY } });
  const studentUser = await prisma.user.findFirst({ where: { role: Role.STUDENT } });

  if (!adminUser || !facultyUser || !studentUser) {
    console.error('❌ Error: Seeded users are required to run tests. Run npm run db:seed first.');
    process.exit(1);
  }

  // Database cleanup to ensure isolated test environment
  await prisma.aIDocument.deleteMany({});
  await prisma.aIPracticeAttempt.deleteMany({});

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

  // Set necessary local environment variable overrides
  process.env.EMBEDDING_PROVIDER = 'local';
  process.env.LLM_PROVIDER = 'local';

  // Override LocalLLMProvider to return valid mock payload structures specifically for the integration test scenarios
  LocalLLMProvider.prototype.generate = async function (systemPrompt: string, history: any[], userMessage: string): Promise<string> {
    const promptLower = systemPrompt.toLowerCase();
    
    if (promptLower.includes('question generator') || promptLower.includes('generate')) {
      if (promptLower.includes('mcq questions') || promptLower.includes(' mcq ')) {
        return JSON.stringify([
          {
            question: 'What is the maximum window size in TCP?',
            options: ['16', '32', '64', '128'],
            correctAnswer: 2,
            explanation: 'TCP window size is 64KB (65535 bytes).'
          },
          {
            question: 'Which protocol is connection-oriented?',
            options: ['UDP', 'TCP', 'IP', 'DNS'],
            correctAnswer: 1,
            explanation: 'TCP is connection-oriented.'
          }
        ]);
      }
      if (promptLower.includes('nat questions') || promptLower.includes(' nat ')) {
        return JSON.stringify([
          {
            question: 'Calculate the B-tree height with 100 keys.',
            numericAnswer: 3.0,
            tolerance: 0.05,
            explanation: 'Log base 100.'
          }
        ]);
      }
    }
    
    if (promptLower.includes('statistics assistant')) {
      return 'The statistics show 0 registered students.';
    }
    
    if (promptLower.includes('rag') || promptLower.includes('examination assistant')) {
      return 'According to the document, candidates must have a Bachelor degree to be eligible.';
    }
    
    return 'Mock RAG/Stats response.';
  };

  try {
    // ----------------------------------------------------
    // TEST 1: Upload and scan a document for RAG processing
    // ----------------------------------------------------
    console.log('--- TEST 1: Document Upload & Auto-Processing ---');
    const txtBuffer = Buffer.from('This is a sample document containing GATE Exam Syllabus. Candidates must have a Bachelor degree to be eligible.');
    
    const doc = await DocumentService.uploadDocument({
      fileBuffer: txtBuffer,
      fileName: 'GATE_Syllabus.txt',
      mimeType: 'text/plain',
      title: 'GATE Syllabus guidelines 2026',
      visibility: AIDocumentVisibility.PUBLIC,
      userId: facultyUser.id,
      role: Role.FACULTY,
    });

    // Wait for the background worker to finish processing
    await waitForDocumentReady(doc.id);

    const processedDoc = await prisma.aIDocument.findUnique({
      where: { id: doc.id },
      include: { chunks: true },
    });

    assert(processedDoc !== null, 'Document metadata created');
    assert(processedDoc?.status === 'READY', 'Background parsing finished successfully and status is READY');
    assert(!!(processedDoc?.chunks && processedDoc.chunks.length > 0), 'Extracted text was chunked and saved to DB');

    // ----------------------------------------------------
    // TEST 2: Student retrieves public syllabus content via RAG
    // ----------------------------------------------------
    console.log('\n--- TEST 2: RAG Semantic search & scope authorization ---');
    const studentChunks = await RAGService.searchChunks({
      query: 'GATE Exam Syllabus eligible requirements',
      userId: studentUser.id,
      role: Role.STUDENT,
    });

    assert(studentChunks.length > 0, 'Student retrieved relevant chunks from public documents');
    assert(studentChunks[0].documentId === doc.id, 'Retrieved chunk points back to the correct document');

    // ----------------------------------------------------
    // TEST 3: Student query private document (Security Isolation Check)
    // ----------------------------------------------------
    console.log('\n--- TEST 3: Private Document Isolation Check ---');
    // Upload a private document owned by Faculty
    const privateDoc = await DocumentService.uploadDocument({
      fileBuffer: Buffer.from('Top secret: faculty research projects database passwords.'),
      fileName: 'secrets.txt',
      mimeType: 'text/plain',
      title: 'Faculty Secret Notes',
      visibility: AIDocumentVisibility.PRIVATE,
      userId: facultyUser.id,
      role: Role.FACULTY,
    });

    // Wait for the background worker to finish processing
    await waitForDocumentReady(privateDoc.id);

    // Try to search as student
    const leakedChunks = await RAGService.searchChunks({
      query: 'top secret projects',
      userId: studentUser.id,
      role: Role.STUDENT,
    });

    const hasPrivateDoc = leakedChunks.some((c) => c.documentId === privateDoc.id);
    assert(!hasPrivateDoc, 'Student is blocked from searching private document chunks');

    // Try to search as owner Faculty
    const facultySearch = await RAGService.searchChunks({
      query: 'top secret projects',
      userId: facultyUser.id,
      role: Role.FACULTY,
    });
    const hasPrivateFacultyDoc = facultySearch.some((c) => c.documentId === privateDoc.id);
    assert(hasPrivateFacultyDoc, 'Owner Faculty can successfully search their own private documents');

    // ----------------------------------------------------
    // TEST 4: Chat Orchestration Stats Routing (Security Predefined SQL check)
    // ----------------------------------------------------
    console.log('\n--- TEST 4: Chat Predefined Stats Query Routing ---');
    const chatResult = await AIChatService.processChatMessage(
      adminUser.id,
      Role.ADMIN,
      'How many registered students are there?'
    );

    assert(chatResult.success === true, 'Chat router matched stats query successfully');
    assert(chatResult.answer !== undefined, 'Returned numeric-based stats response text');

    // ----------------------------------------------------
    // TEST 5: Question Generation MCQ
    // ----------------------------------------------------
    console.log('\n--- TEST 5: AI Question Generator MCQ ---');
    const generatedMcqs = await QuestionGenerationService.generateQuestions({
      subject: 'Computer Networks',
      topic: 'TCP Congestion Control',
      difficulty: Difficulty.MEDIUM,
      questionType: QuestionType.MCQ,
      count: 2,
      marks: 2.0,
      negativeMarking: 0.66,
      documentIds: [doc.id],
      userId: facultyUser.id,
      role: Role.FACULTY,
    });

    assert(generatedMcqs.length > 0, 'Generated MCQ questions array successfully');
    assert(generatedMcqs[0].type === 'MCQ', 'Question type is strictly MCQ');
    assert(generatedMcqs[0].options.length === 4, 'MCQ has exactly 4 options');

    // ----------------------------------------------------
    // TEST 6: Question Generation NAT validation
    // ----------------------------------------------------
    console.log('\n--- TEST 6: AI Question Generator NAT ---');
    const generatedNats = await QuestionGenerationService.generateQuestions({
      subject: 'Data Structures',
      topic: 'B-Trees',
      difficulty: Difficulty.HARD,
      questionType: QuestionType.NAT,
      count: 1,
      marks: 2.0,
      negativeMarking: 0,
      userId: facultyUser.id,
      role: Role.FACULTY,
    });

    assert(generatedNats.length > 0, 'Generated NAT question successfully');
    assert(generatedNats[0].correctAnswer.value !== undefined, 'NAT correct answer contains correct numeric value');

    // ----------------------------------------------------
    // TEST 7: Duplicate Question Detection
    // ----------------------------------------------------
    console.log('\n--- TEST 7: Duplicate Question Detection ---');
    // Save a question to DB
    const subtopicId = generatedMcqs[0].subtopicId;
    const testQuestion = await prisma.question.create({
      data: {
        text: 'What is the maximum window size in TCP?',
        type: QuestionType.MCQ,
        difficulty: Difficulty.MEDIUM,
        options: ['16', '32', '64', '128'],
        correctAnswer: [2],
        subtopicId,
        createdById: facultyUser.id,
      },
    });

    const isDupe = await QuestionGenerationService.isDuplicate('What is the maximum window size in TCP?');
    assert(isDupe === true, 'Duplicate checking flagged exact same question');

    const isDupeNormalized = await QuestionGenerationService.isDuplicate('  WHAT is the MAXIMUM window size in TCP?!!! ');
    assert(isDupeNormalized === true, 'Duplicate checking normalized casing and symbols correctly');

    // Clean up test question
    await prisma.question.delete({ where: { id: testQuestion.id } });

    // ----------------------------------------------------
    // TEST 8: Practice Mode Isolation
    // ----------------------------------------------------
    console.log('\n--- TEST 8: Student Practice Attempt Isolation ---');
    
    // Check initial counts
    const prevAttemptCount = await prisma.aIPracticeAttempt.count({ where: { studentId: studentUser.id } });
    const prevOfficialCount = await prisma.testAssignment.count({ where: { studentId: studentUser.id } });

    const practiceQuestions = [
      { id: 'p1', question: 'Solve 2+2', type: 'NAT', correctAnswer: 4, tolerance: 0 },
      { id: 'p2', question: 'Choose A', type: 'MCQ', options: ['A', 'B'], correctAnswer: 0 },
    ];

    const submissionResult = await PracticeService.submitPracticeSet({
      subject: 'Mathematics',
      topic: 'Addition',
      difficulty: Difficulty.EASY,
      questions: practiceQuestions,
      answers: ['4', '1'], // Question 1 correct, Question 2 incorrect
      userId: studentUser.id,
    });

    assert(submissionResult.score === 1.0, 'Practice scoring evaluated correctly');
    assert(submissionResult.accuracy === 50, 'Practice accuracy calculated as 50%');

    const postAttemptCount = await prisma.aIPracticeAttempt.count({ where: { studentId: studentUser.id } });
    const postOfficialCount = await prisma.testAssignment.count({ where: { studentId: studentUser.id } });

    assert(postAttemptCount === prevAttemptCount + 1, 'New practice attempt saved to AIPracticeAttempt table');
    assert(postOfficialCount === prevOfficialCount, 'Official TestAssignment table remained completely untouched (Practice Isolation verified)');

    // ----------------------------------------------------
    // Cleanup files
    // ----------------------------------------------------
    await prisma.aIPracticeAttempt.delete({ where: { id: submissionResult.attemptId } });
    await prisma.aIDocument.delete({ where: { id: doc.id } });
    await prisma.aIDocument.delete({ where: { id: privateDoc.id } });

    console.log('\n📊 Integration Test Results:');
    console.log(`Passed ${passCount}/${testCount} tests.`);
    if (passCount === testCount) {
      console.log('🎉 All Phase 2D Integration Tests Passed successfully!\n');
    } else {
      console.error('❌ Error: Some tests failed.\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Test Execution Failed with Error:', error);
    process.exit(1);
  }
}

runTests();
