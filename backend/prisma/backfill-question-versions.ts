import { prisma } from '../src/config/prisma';

async function run() {
  console.log('🔄 Backfilling QuestionVersion v1 for existing questions...');

  const questions = await prisma.question.findMany();
  let versionsCreated = 0;

  for (const q of questions) {
    const existing = await prisma.questionVersion.findUnique({
      where: { questionId_versionNumber: { questionId: q.id, versionNumber: 1 } },
    });
    if (existing) continue;

    await prisma.questionVersion.create({
      data: {
        questionId: q.id,
        versionNumber: 1,
        text: q.text,
        type: q.type,
        difficulty: q.difficulty,
        marks: q.marks,
        negativeMarks: q.negativeMarks,
        options: q.options as any,
        correctAnswer: q.correctAnswer as any,
        explanation: q.explanation,
        imageUrl: q.imageUrl,
        createdAt: q.createdAt,
      },
    });
    versionsCreated++;
  }
  console.log(`✅ Created ${versionsCreated} QuestionVersion v1 rows (${questions.length - versionsCreated} already existed).`);

  console.log('🔄 Backfilling MockTestQuestion.questionVersionId for existing rows...');
  const unversioned = await prisma.mockTestQuestion.findMany({
    where: { questionVersionId: null },
    select: { id: true, questionId: true },
  });

  let attached = 0;
  for (const mtq of unversioned) {
    const v1 = await prisma.questionVersion.findUnique({
      where: { questionId_versionNumber: { questionId: mtq.questionId, versionNumber: 1 } },
    });
    if (!v1) {
      console.warn(`⚠️  No version found for question ${mtq.questionId} (MockTestQuestion ${mtq.id}) — skipping`);
      continue;
    }
    await prisma.mockTestQuestion.update({
      where: { id: mtq.id },
      data: { questionVersionId: v1.id },
    });
    attached++;
  }
  console.log(`✅ Attached questionVersionId to ${attached}/${unversioned.length} existing MockTestQuestion rows.`);
}

run()
  .catch((e) => {
    console.error('❌ Backfill failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
