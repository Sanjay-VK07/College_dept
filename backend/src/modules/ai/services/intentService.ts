export type AIIntent =
  | 'GENERAL_KNOWLEDGE'
  | 'PORTAL_UPCOMING_EXAMS'
  | 'PORTAL_EXAM_RESULT'
  | 'PORTAL_COMPLETED_EXAMS'
  | 'PORTAL_PERFORMANCE'
  | 'PORTAL_ATTENDANCE'
  | 'PORTAL_PROFILE'
  | 'PORTAL_NAVIGATION'
  | 'UNKNOWN';

export class IntentService {
  /**
   * Deterministically classifies the intent of a user message without extra LLM latency
   */
  public static classifyIntent(userMessage: string): AIIntent {
    if (!userMessage || typeof userMessage !== 'string') {
      return 'UNKNOWN';
    }

    const lower = userMessage.toLowerCase().trim();

    // 1. Navigation questions ("where can I find", "how do I open", "how to navigate")
    if (
      lower.includes('where can i') ||
      lower.includes('how do i open') ||
      lower.includes('how to navigate') ||
      lower.includes('where is the') ||
      lower.includes('portal help') ||
      lower.includes('how do i launch')
    ) {
      return 'PORTAL_NAVIGATION';
    }

    // 2. Upcoming Exams questions ("when is my next exam", "upcoming tests", "scheduled exam")
    if (
      lower.includes('next exam') ||
      lower.includes('upcoming exam') ||
      lower.includes('upcoming test') ||
      lower.includes('when is my test') ||
      lower.includes('assigned exam') ||
      lower.includes('schedule')
    ) {
      return 'PORTAL_UPCOMING_EXAMS';
    }

    // 3. Exam Results questions ("what was my score", "my result", "exam marks", "marks obtained")
    if (
      lower.includes('my score') ||
      lower.includes('my result') ||
      lower.includes('exam marks') ||
      lower.includes('marks obtained') ||
      lower.includes('how much did i get')
    ) {
      return 'PORTAL_EXAM_RESULT';
    }

    // 4. Completed Exams history ("completed exams", "past tests", "history of tests")
    if (
      lower.includes('completed exam') ||
      lower.includes('past test') ||
      lower.includes('test history') ||
      lower.includes('finished exam')
    ) {
      return 'PORTAL_COMPLETED_EXAMS';
    }

    // 5. Performance questions ("my accuracy", "strong topics", "weak topics", "my performance")
    if (
      lower.includes('performance') ||
      lower.includes('accuracy') ||
      lower.includes('strong topic') ||
      lower.includes('weak topic') ||
      lower.includes('my progress')
    ) {
      return 'PORTAL_PERFORMANCE';
    }

    // 6. Attendance questions ("my attendance", "attendance percentage")
    if (lower.includes('attendance')) {
      return 'PORTAL_ATTENDANCE';
    }

    // 7. Profile details ("my register number", "my department", "my section", "my profile")
    if (
      lower.includes('my register') ||
      lower.includes('my department') ||
      lower.includes('my section') ||
      lower.includes('my profile') ||
      lower.includes('who am i')
    ) {
      return 'PORTAL_PROFILE';
    }

    // 8. General Knowledge questions ("what is", "explain", "how does", "formula", "gate pattern", "dijkstra", "deadlock")
    if (
      lower.startsWith('what is') ||
      lower.startsWith('explain') ||
      lower.startsWith('how does') ||
      lower.startsWith('define') ||
      lower.includes('algorithm') ||
      lower.includes('deadlock') ||
      lower.includes('dijkstra') ||
      lower.includes('gate pattern') ||
      lower.includes('gate syllabus') ||
      lower.includes('calculator rules')
    ) {
      return 'GENERAL_KNOWLEDGE';
    }

    // Default fallback to GENERAL_KNOWLEDGE if open-ended prompt
    return 'GENERAL_KNOWLEDGE';
  }
}
