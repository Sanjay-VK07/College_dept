import { RAGEvaluationService } from '../services/ragEvaluationService';
import { AIRAGQualityClassification } from '@prisma/client';

describe('RAGEvaluationService Unit Tests', () => {
  it('should classify HIGH_CONFIDENCE when top similarity >= 0.75 and relevant chunks >= 1', () => {
    const result = RAGEvaluationService.evaluateRetrieval({
      chunks: [
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          documentTitle: 'Syllabus',
          content: 'Compiler Design Syllabus CS6301',
          similarityScore: 0.85,
        },
      ],
    });

    expect(result.qualityClassification).toBe(AIRAGQualityClassification.HIGH_CONFIDENCE);
    expect(result.qualityScore).toBe(0.85);
    expect(result.relevantChunksUsed).toBe(1);
    expect(result.validatedSources.length).toBe(1);
    expect(result.validatedSources[0].title).toBe('Syllabus');
  });

  it('should classify MEDIUM_CONFIDENCE when top similarity is between 0.50 and 0.74', () => {
    const result = RAGEvaluationService.evaluateRetrieval({
      chunks: [
        {
          chunkId: 'chunk-2',
          documentId: 'doc-2',
          documentTitle: 'Exam Rules',
          content: 'Regulations for mock exams',
          similarityScore: 0.62,
        },
      ],
    });

    expect(result.qualityClassification).toBe(AIRAGQualityClassification.MEDIUM_CONFIDENCE);
    expect(result.qualityScore).toBe(0.62);
  });

  it('should classify LOW_CONFIDENCE when top similarity is between 0.35 and 0.49', () => {
    const result = RAGEvaluationService.evaluateRetrieval({
      chunks: [
        {
          chunkId: 'chunk-3',
          documentId: 'doc-3',
          documentTitle: 'General Info',
          content: 'Campus library info',
          similarityScore: 0.40,
        },
      ],
    });

    expect(result.qualityClassification).toBe(AIRAGQualityClassification.LOW_CONFIDENCE);
  });

  it('should classify NO_RELEVANT_CONTEXT when chunks array is empty or max similarity < 0.35', () => {
    const emptyResult = RAGEvaluationService.evaluateRetrieval({ chunks: [] });
    expect(emptyResult.qualityClassification).toBe(AIRAGQualityClassification.NO_RELEVANT_CONTEXT);

    const lowScoreResult = RAGEvaluationService.evaluateRetrieval({
      chunks: [
        {
          chunkId: 'chunk-4',
          documentId: 'doc-4',
          documentTitle: 'Irrelevant',
          content: 'Random text',
          similarityScore: 0.15,
        },
      ],
    });
    expect(lowScoreResult.qualityClassification).toBe(AIRAGQualityClassification.NO_RELEVANT_CONTEXT);
  });

  it('should classify RETRIEVAL_FAILED when retrieval error is present', () => {
    const result = RAGEvaluationService.evaluateRetrieval({
      chunks: [],
      retrievalError: new Error('Vector database timeout'),
    });

    expect(result.qualityClassification).toBe(AIRAGQualityClassification.RETRIEVAL_FAILED);
  });

  it('should validate citation provenance and remove duplicate document sources', () => {
    const sources = RAGEvaluationService.validateCitationProvenance({
      userId: 'user-1',
      role: 'STUDENT' as any,
      retrievedChunks: [],
      assembledContextChunks: [
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          documentTitle: 'GATE Physics Notes',
          content: 'Content 1',
          similarityScore: 0.9,
        },
        {
          chunkId: 'chunk-2',
          documentId: 'doc-1', // Duplicate doc
          documentTitle: 'GATE Physics Notes',
          content: 'Content 2',
          similarityScore: 0.8,
        },
      ],
    });

    expect(sources.length).toBe(1);
    expect(sources[0].documentId).toBe('doc-1');
    expect(sources[0].title).toBe('GATE Physics Notes');
  });
});
