import { VerifiedContextResponse } from '../services/contextService';
import { BASE_SYSTEM_PROMPT } from './systemPrompt';

export function buildStudentPrompt(context: VerifiedContextResponse): string {
  let contextBlock = `VERIFIED AUTHENTICATED USER CONTEXT (STUDENT):\n- Name: ${context.userSummary.name}\n- Department: ${context.userSummary.department}\n`;

  if (context.intent === 'GENERAL_KNOWLEDGE') {
    contextBlock += `- Intent: General Knowledge / Concepts (No private database records attached)\n`;
  } else if (context.intent === 'PORTAL_UPCOMING_EXAMS') {
    contextBlock += `- Intent: Portal Upcoming Exams\n`;
    if (context.upcomingExams && context.upcomingExams.length > 0) {
      contextBlock += `- Verified Upcoming Exams:\n` + context.upcomingExams.map((e) => `  * ${e.title} (Scheduled: ${e.scheduledAt}, Duration: ${e.durationMinutes} mins)`).join('\n') + '\n';
    } else {
      contextBlock += `- Verified Upcoming Exams: No scheduled exams found in database.\n`;
    }
  } else if (context.intent === 'PORTAL_EXAM_RESULT' || context.intent === 'PORTAL_COMPLETED_EXAMS') {
    contextBlock += `- Intent: Portal Exam Results\n`;
    if (context.completedExams && context.completedExams.length > 0) {
      contextBlock += `- Verified Completed Exams:\n` + context.completedExams.map((e) => `  * ${e.title} (Score: ${e.score}/${e.totalMarks}, Submitted: ${e.completedAt})`).join('\n') + '\n';
    } else {
      contextBlock += `- Verified Completed Exams: No completed assessments found in database.\n`;
    }
  } else if (context.intent === 'PORTAL_ATTENDANCE') {
    contextBlock += `- Intent: Portal Attendance\n- Minimum Requirement: ${context.attendanceSummary?.minimumRequiredPercent}\n- Actual Attendance Log: Unavailable (No daily attendance model)\n`;
  } else if (context.intent === 'PORTAL_PROFILE') {
    contextBlock += `- Intent: Portal Profile\n- Register No: ${context.profileDetails?.registerNo}\n- Semester: ${context.profileDetails?.semester}\n- Section: ${context.profileDetails?.section}\n`;
  } else if (context.intent === 'PORTAL_NAVIGATION') {
    contextBlock += `- Intent: Portal Navigation Guide\n` + context.navigationGuide?.map((n) => `  * ${n.feature} -> ${n.location}`).join('\n') + '\n';
  }

  return `${BASE_SYSTEM_PROMPT}\n\n${contextBlock}`;
}
