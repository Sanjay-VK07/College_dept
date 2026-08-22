import { prisma } from '../src/config/prisma';
import { EmbeddingProvider } from '../src/modules/ai/services/embeddingProvider';

async function run() {
  console.log('🔄 Backfilling embeddings for existing questions (needed for semantic duplicate detection)...');

  const allQuestions = await prisma.question.findMany({ select: { id: true, text: true, embedding: true } });
  const questions = allQuestions.filter((q) => !q.embedding || q.embedding.length === 0);

  let updated = 0;
  for (const q of questions) {
    const embedding = await EmbeddingProvider.getEmbeddingOrEmpty(q.text);
    await prisma.question.update({
      where: { id: q.id },
      data: { embedding },
    });
    updated++;
  }
  console.log(`✅ Backfilled embeddings for ${updated}/${questions.length} questions missing one.`);
}

run()
  .catch((e) => {
    console.error('❌ Backfill failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
