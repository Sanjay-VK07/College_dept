import { prisma } from '../config/prisma';

export async function runAnswerMappingAudit() {
  const allQuestions = await prisma.question.findMany();

  let totalQuestions = allQuestions.length;
  let answersFound = 0;
  let answersMapped = 0;
  let answersMissing = 0;
  let answersInvalid = 0;
  let msqMapped = 0;
  let natMapped = 0;
  let naCount = 0;
  let unansweredInSource = 0;

  const sampleUnmapped: any[] = [];

  for (const q of allQuestions) {
    const rawAns = q.rawAnswer || (q.visualMetadata as any)?.rawAnswer || (q.visualMetadata as any)?.answer;
    const ca = q.correctAnswer;
    const qType = q.type;

    if (q.verificationStatus === 'UNANSWERED_IN_SOURCE') {
      unansweredInSource++;
    }

    if (rawAns === 'N/A' || (ca as any) === 'N/A') {
      naCount++;
    }

    const hasRaw = Boolean(rawAns && String(rawAns).trim() !== '' && String(rawAns).trim() !== 'N/A');
    if (hasRaw) {
      answersFound++;
    }

    let isMapped = false;
    if (Array.isArray(ca)) {
      if (ca.length > 0) isMapped = true;
    } else if (ca && typeof ca === 'object') {
      if (Object.keys(ca).length > 0) isMapped = true;
    } else if (ca !== undefined && ca !== null && ca !== '') {
      isMapped = true;
    }

    if (isMapped) {
      answersMapped++;
      if (qType === 'MSQ') msqMapped++;
      if (qType === 'NAT') natMapped++;
    } else {
      if (hasRaw) {
        answersInvalid++;
        if (sampleUnmapped.length < 5) {
          sampleUnmapped.push({
            id: q.id,
            customId: q.customId,
            type: qType,
            rawAnswer: rawAns,
            correctAnswer: ca,
            optionsCount: Array.isArray(q.options) ? q.options.length : 0,
            optionsSample: (q.options as any[])?.slice(0, 2),
            verificationStatus: q.verificationStatus,
          });
        }
      } else {
        answersMissing++;
      }
    }
  }

  const report = {
    totalQuestions,
    answersFound,
    answersMapped,
    answersMissing,
    answersInvalid,
    msqMapped,
    natMapped,
    naCount,
    unansweredInSource,
    sampleUnmapped,
  };

  return report;
}

if (require.main === module) {
  runAnswerMappingAudit()
    .then((report) => {
      console.log('=== ANSWER MAPPING AUDIT REPORT ===');
      console.log(JSON.stringify(report, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
