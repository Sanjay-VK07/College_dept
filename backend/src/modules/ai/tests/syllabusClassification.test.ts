import { SyllabusClassificationService } from '../services/syllabusClassificationService';
import { prisma } from '../../../config/prisma';

describe('Syllabus Classification Tests', () => {
  const testSubjId = 'class-subj-' + Date.now();
  const testModId = 'class-mod-' + Date.now();
  const testTopId = 'class-top-' + Date.now();
  const testSubtopId = 'class-subtop-' + Date.now();

  beforeAll(async () => {
    const subj = await prisma.subject.create({
      data: { id: testSubjId, name: 'Computer Architecture', code: 'CS_COA_' + Date.now(), department: 'CSE' },
    });
    const mod = await prisma.module.create({
      data: { id: testModId, name: 'Memory System', subjectId: subj.id },
    });
    const top = await prisma.topic.create({
      data: { id: testTopId, name: 'Cache Memory', moduleId: mod.id },
    });
    await prisma.subtopic.create({
      data: { id: testSubtopId, name: 'Direct Mapping', topicId: top.id },
    });
  });

  afterAll(async () => {
    await prisma.subtopic.deleteMany({ where: { id: testSubtopId } });
    await prisma.topic.deleteMany({ where: { id: testTopId } });
    await prisma.module.deleteMany({ where: { id: testModId } });
    await prisma.subject.deleteMany({ where: { id: testSubjId } });
  });

  it('1. Classifies document text into GATE academic hierarchy', async () => {
    const text = 'Direct Mapping cache memory placement policies in Computer Architecture.';
    const result = await SyllabusClassificationService.classifyDocumentContent(text, 'Cache Notes');

    expect(result.classificationStatus).toBe('CLASSIFIED');
    expect(result.subjectId).toBe(testSubjId);
    expect(result.classificationConfidence).toBeGreaterThanOrEqual(0.4);
  });

  it('2. Marks status = REQUIRES_CLASSIFICATION when text is unmapped', async () => {
    const unmappedText = 'Cooking recipes for chocolate cake and vanilla ice cream.';
    const result = await SyllabusClassificationService.classifyDocumentContent(unmappedText, 'Recipes');

    expect(result.classificationStatus).toBe('REQUIRES_CLASSIFICATION');
  });

  it('3. Allows manual update of document classification by Faculty/Admin', async () => {
    const user = await prisma.user.findFirst();
    if (!user) return;

    const doc = await prisma.aIDocument.create({
      data: {
        title: 'Unclassified Resource',
        fileName: 'unclass.pdf',
        mimeType: 'application/pdf',
        storageKey: 'unclass_' + Date.now(),
        visibility: 'FACULTY',
        uploadedById: user.id,
      },
    });

    const updateRes = await SyllabusClassificationService.updateDocumentClassification(doc.id, {
      subjectId: testSubjId,
      moduleId: testModId,
      topicId: testTopId,
      subtopicId: testSubtopId,
    });

    expect(updateRes.success).toBe(true);
    expect(updateRes.document.classificationStatus).toBe('CLASSIFIED');

    await prisma.aIDocument.delete({ where: { id: doc.id } });
  });
});
