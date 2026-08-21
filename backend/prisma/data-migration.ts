import { ExamStatus } from '@prisma/client';
import { prisma } from '../src/config/prisma';

async function run() {
  console.log('🔄 Running data migration for existing MockTest records...');
  
  const exams = await prisma.mockTest.findMany();
  let updatedCount = 0;
  
  for (const exam of exams) {
    const targetStatus = exam.isPublished ? ExamStatus.PUBLISHED : ExamStatus.DRAFT;
    await prisma.mockTest.update({
      where: { id: exam.id },
      data: { status: targetStatus },
    });
    updatedCount++;
    console.log(`Updated exam "${exam.title}" (ID: ${exam.id}) status to ${targetStatus}`);
  }
  
  console.log(`✅ Data migration completed. Updated ${updatedCount} exams.`);
}

run()
  .catch((e) => {
    console.error('❌ Data migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
