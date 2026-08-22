import { prisma } from '../../../config/prisma';

export interface ClassificationResult {
  subjectId?: string;
  moduleId?: string;
  topicId?: string;
  subtopicId?: string;
  classificationConfidence: number;
  classificationStatus: 'CLASSIFIED' | 'REQUIRES_CLASSIFICATION';
}

export class SyllabusClassificationService {
  /**
   * Classifies extracted document text into the GATE syllabus hierarchy (Subject -> Module -> Topic -> Subtopic).
   */
  public static async classifyDocumentContent(
    text: string,
    title: string
  ): Promise<ClassificationResult> {
    try {
      const combinedText = `${title}\n${text.slice(0, 5000)}`.toLowerCase();

      // Fetch all Subjects, Modules, Topics, and Subtopics from existing taxonomy
      const subjects = await prisma.subject.findMany({
        include: {
          modules: {
            include: {
              topics: {
                include: {
                  subtopics: true,
                },
              },
            },
          },
        },
      });

      if (subjects.length === 0) {
        return {
          classificationConfidence: 0,
          classificationStatus: 'REQUIRES_CLASSIFICATION',
        };
      }

      let bestMatch: {
        subjectId?: string;
        moduleId?: string;
        topicId?: string;
        subtopicId?: string;
        score: number;
      } = { score: 0 };

      // Search taxonomy for keyword hits
      for (const subject of subjects) {
        let subjectScore = 0;
        if (combinedText.includes(subject.name.toLowerCase())) subjectScore += 3;

        for (const moduleObj of subject.modules) {
          let moduleScore = subjectScore;
          if (combinedText.includes(moduleObj.name.toLowerCase())) moduleScore += 4;

          for (const topic of moduleObj.topics) {
            let topicScore = moduleScore;
            if (combinedText.includes(topic.name.toLowerCase())) topicScore += 5;

            for (const subtopic of topic.subtopics) {
              let subtopicScore = topicScore;
              if (combinedText.includes(subtopic.name.toLowerCase())) subtopicScore += 6;

              if (subtopicScore > bestMatch.score) {
                bestMatch = {
                  subjectId: subject.id,
                  moduleId: moduleObj.id,
                  topicId: topic.id,
                  subtopicId: subtopic.id,
                  score: subtopicScore,
                };
              }
            }

            if (topicScore > bestMatch.score && (!bestMatch.topicId || topicScore > bestMatch.score)) {
              bestMatch = {
                subjectId: subject.id,
                moduleId: moduleObj.id,
                topicId: topic.id,
                subtopicId: topic.subtopics[0]?.id,
                score: topicScore,
              };
            }
          }
        }
      }

      // Normalize confidence score between 0.0 and 1.0
      const confidence = Math.min(1.0, Number((bestMatch.score / 15).toFixed(2)));
      const isClassified = confidence >= 0.4 && Boolean(bestMatch.subjectId);

      if (isClassified) {
        return {
          subjectId: bestMatch.subjectId,
          moduleId: bestMatch.moduleId,
          topicId: bestMatch.topicId,
          subtopicId: bestMatch.subtopicId,
          classificationConfidence: confidence,
          classificationStatus: 'CLASSIFIED',
        };
      }

      return {
        subjectId: bestMatch.subjectId || subjects[0]?.id,
        moduleId: bestMatch.moduleId,
        topicId: bestMatch.topicId,
        subtopicId: bestMatch.subtopicId,
        classificationConfidence: confidence,
        classificationStatus: 'REQUIRES_CLASSIFICATION',
      };
    } catch (err: any) {
      console.error('[SyllabusClassificationService] Classification Error:', err);
      return {
        classificationConfidence: 0,
        classificationStatus: 'REQUIRES_CLASSIFICATION',
      };
    }
  }

  /**
   * Updates document classification manually by Faculty/Admin.
   */
  public static async updateDocumentClassification(
    documentId: string,
    params: {
      subjectId?: string;
      moduleId?: string;
      topicId?: string;
      subtopicId?: string;
    }
  ) {
    const { subjectId, moduleId, topicId, subtopicId } = params;

    const updated = await prisma.aIDocument.update({
      where: { id: documentId },
      data: {
        subjectId,
        moduleId,
        topicId,
        subtopicId,
        classificationConfidence: 1.0,
        classificationStatus: 'CLASSIFIED',
      },
    });

    return {
      success: true,
      message: 'Document classification updated successfully.',
      document: updated,
    };
  }
}
