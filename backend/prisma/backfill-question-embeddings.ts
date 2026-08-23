import { prisma } from '../src/config/prisma';
import { EmbeddingProvider } from '../src/modules/ai/services/embeddingProvider';

/**
 * (Re)generates Question.embedding + Question.embeddingModel using the currently configured
 * embedding provider.
 *
 * Run this after changing EMBEDDING_PROVIDER / EMBEDDING_MODEL: vectors from a different model
 * live in a different space and are deliberately not compared against the new ones, so semantic
 * duplicate detection silently degrades to lexical-only until they are regenerated.
 *
 * Pass --all to re-embed every question (needed after a provider switch);
 * the default only fills in questions that have no embedding at all.
 */
async function run() {
  const reembedAll = process.argv.includes('--all');
  const activeModel = EmbeddingProvider.activeModelId();

  console.log(`🔄 Backfilling question embeddings using model "${activeModel}" (${reembedAll ? 'ALL questions' : 'missing/stale only'})...`);

  const allQuestions = await prisma.question.findMany({
    select: { id: true, text: true, embedding: true, embeddingModel: true },
  });

  const questions = reembedAll
    ? allQuestions
    : allQuestions.filter((q) => !q.embedding || q.embedding.length === 0 || q.embeddingModel !== activeModel);

  if (questions.length === 0) {
    console.log('✅ Nothing to do — every question already has an embedding from the active model.');
    return;
  }

  let updated = 0;
  let failed = 0;

  for (const q of questions) {
    const fields = await EmbeddingProvider.getEmbeddingFields(q.text);
    if (fields.embedding.length === 0) {
      // getEmbeddingFields returns empty when the provider failed. Persisting that would wipe a
      // usable existing vector, so skip and report instead — never silently destroy data.
      failed++;
      continue;
    }
    await prisma.question.update({ where: { id: q.id }, data: fields });
    updated++;
  }

  console.log(`✅ Embedded ${updated}/${questions.length} questions with "${activeModel}".`);
  if (failed > 0) {
    console.warn(
      `⚠️  ${failed} question(s) could not be embedded — the provider failed for them and their existing ` +
        `vectors were left untouched. Fix the embedding provider and re-run.`
    );
    process.exitCode = 1;
  }
}

run()
  .catch((e) => {
    console.error('❌ Backfill failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
