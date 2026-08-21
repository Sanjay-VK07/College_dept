import { QuestionBankIntelligenceService } from './questionBankIntelligenceService';
import { CohortIntelligenceService } from './cohortIntelligenceService';
import { ExamIntelligenceService } from './examIntelligenceService';

export interface FacultyRecommendation {
  id: string;
  type: 'REVIEW_QUESTION' | 'BALANCE_EXAM' | 'ADD_TOPIC_QUESTIONS' | 'REVIEW_DIFFICULTY' | 'IMPROVE_SOLUTION' | 'ADD_LEARNING_MATERIAL';
  title: string;
  evidence: string;
  recommendedAction: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export class FacultyRecommendationService {
  /**
   * Generates evidence-based actionable recommendations for Faculty & Admins.
   */
  public static async generateRecommendations(department: string = 'Computer Science and Engineering'): Promise<FacultyRecommendation[]> {
    const recommendations: FacultyRecommendation[] = [];

    const [qbHealth, cohortOverview, examsIntelligence] = await Promise.all([
      QuestionBankIntelligenceService.getQuestionBankHealth(),
      CohortIntelligenceService.getCohortIntelligence(department),
      ExamIntelligenceService.getAllExamsIntelligence(),
    ]);

    // 1. Recommendation for Pending AI Questions needing review
    if (qbHealth.pendingAiQuestions > 0) {
      recommendations.push({
        id: `rec_pending_q_${Date.now()}`,
        type: 'REVIEW_QUESTION',
        title: 'Review Pending AI-Generated Questions',
        evidence: `There are ${qbHealth.pendingAiQuestions} AI-generated questions awaiting faculty approval in the review queue.`,
        recommendedAction: 'Review pending cards in Question Bank tab to approve or reject items for student exams.',
        priority: 'HIGH',
      });
    }

    // 2. Recommendation for Academic Gaps
    const weakTopics = cohortOverview.academicGaps.filter((g) => g.status === 'WEAK_ACADEMIC_AREA');
    if (weakTopics.length > 0) {
      const topWeak = weakTopics[0];
      recommendations.push({
        id: `rec_weak_topic_${Date.now()}`,
        type: 'ADD_LEARNING_MATERIAL',
        title: `Address Cohort Weakness in '${topWeak.topicName}'`,
        evidence: topWeak.evidence,
        recommendedAction: `Upload additional lecture materials/reference notes for '${topWeak.topicName}' to RAG Knowledge Base and generate targeted practice tests.`,
        priority: 'HIGH',
      });
    }

    // 3. Recommendation for Question Bank Coverage
    const lowCoverageSubject = qbHealth.subjectCoverage.find((s) => s.questionCount < 5);
    if (lowCoverageSubject) {
      recommendations.push({
        id: `rec_low_coverage_${Date.now()}`,
        type: 'ADD_TOPIC_QUESTIONS',
        title: `Expand Question Bank for '${lowCoverageSubject.subjectName}'`,
        evidence: `Subject '${lowCoverageSubject.subjectName}' currently has only ${lowCoverageSubject.questionCount} approved questions in Question Bank.`,
        recommendedAction: `Use AI Question Generator Studio to generate grounded questions for '${lowCoverageSubject.subjectName}'.`,
        priority: 'MEDIUM',
      });
    }

    // 4. Recommendation for Imbalanced Exams
    const imbalancedExam = examsIntelligence.find((e) => e.balanceAssessment.includes('leans heavily'));
    if (imbalancedExam) {
      recommendations.push({
        id: `rec_imbalanced_exam_${Date.now()}`,
        type: 'BALANCE_EXAM',
        title: `Balance Exam Difficulty for '${imbalancedExam.title}'`,
        evidence: imbalancedExam.balanceAssessment,
        recommendedAction: 'Adjust question selections in Intelligent Exam Assembly Studio to achieve standard 30% EASY / 50% MEDIUM / 20% HARD distribution.',
        priority: 'MEDIUM',
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        id: `rec_healthy_${Date.now()}`,
        type: 'REVIEW_QUESTION',
        title: 'Question Bank & Cohort Performance Healthy',
        evidence: `Question Bank has ${qbHealth.totalApprovedQuestions} approved questions with high cohort completion.`,
        recommendedAction: 'Continue monitoring student performance and updating RAG context material.',
        priority: 'LOW',
      });
    }

    return recommendations;
  }
}
