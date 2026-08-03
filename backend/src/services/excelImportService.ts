import xlsx from 'xlsx';
import { QuestionType, Difficulty } from '@prisma/client';
import { prisma } from '../config/prisma';

export class ExcelImportService {
  /**
   * Imports questions from uploaded Excel / CSV / JSON buffer
   */
  public static async importQuestions(fileBuffer: Buffer, fileType: string, createdById: string, defaultSubtopicId: string) {
    let questionRows: any[] = [];

    if (fileType.includes('json')) {
      questionRows = JSON.parse(fileBuffer.toString('utf-8'));
    } else {
      const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      questionRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    }

    const createdQuestions = [];

    for (const row of questionRows) {
      const text = row.Question || row.text || row.QuestionText;
      if (!text) continue;

      const typeStr = (row.Type || row.type || 'MCQ').toUpperCase();
      const type = typeStr === 'MSQ' ? QuestionType.MSQ : typeStr === 'NAT' ? QuestionType.NAT : QuestionType.MCQ;

      const diffStr = (row.Difficulty || row.difficulty || 'MEDIUM').toUpperCase().replace(' ', '_');
      const difficulty = (Object.values(Difficulty) as string[]).includes(diffStr) ? (diffStr as Difficulty) : Difficulty.MEDIUM;

      const marks = Number(row.Marks || row.marks || 1);
      const negativeMarks = type === QuestionType.MCQ ? Number(row.NegativeMarks || row.negativeMarks || (marks === 2 ? 0.67 : 0.33)) : 0;

      // Extract options
      let options = [];
      if (row.Options && typeof row.Options === 'string') {
        options = row.Options.split('|').map((opt: string) => ({ text: opt.trim() }));
      } else if (Array.isArray(row.options)) {
        options = row.options;
      } else {
        options = [
          { text: row.OptionA || row.optionA || 'Option A' },
          { text: row.OptionB || row.optionB || 'Option B' },
          { text: row.OptionC || row.optionC || 'Option C' },
          { text: row.OptionD || row.optionD || 'Option D' },
        ];
      }

      // Extract correct answer
      let correctAnswer: any;
      if (row.CorrectAnswer !== undefined || row.correctAnswer !== undefined) {
        const rawAns = row.CorrectAnswer ?? row.correctAnswer;
        if (type === QuestionType.NAT) {
          correctAnswer = typeof rawAns === 'object' ? rawAns : { value: Number(rawAns), min: Number(rawAns), max: Number(rawAns) };
        } else if (type === QuestionType.MSQ) {
          correctAnswer = typeof rawAns === 'string' ? rawAns.split(',').map(n => Number(n.trim())) : rawAns;
        } else {
          correctAnswer = [Number(rawAns)];
        }
      } else {
        correctAnswer = [0];
      }

      const question = await prisma.question.create({
        data: {
          text,
          type,
          difficulty,
          marks,
          negativeMarks,
          options,
          correctAnswer,
          explanation: row.Explanation || row.explanation || '',
          reference: row.Reference || row.reference || '',
          previousYear: row.PreviousYear || row.previousYear || '',
          subtopicId: row.subtopicId || defaultSubtopicId,
          createdById,
        },
      });

      createdQuestions.push(question);
    }

    return createdQuestions;
  }

  /**
   * Imports students from Excel / CSV
   */
  public static async importStudents(fileBuffer: Buffer) {
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const studentRows: any[] = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const createdStudents = [];

    for (const row of studentRows) {
      const email = row.Email || row.email;
      if (!email) continue;

      const student = await prisma.user.upsert({
        where: { email },
        update: {
          registerNo: String(row.RegisterNo || row.registerNo || ''),
          name: row.Name || row.name || 'Student',
          department: row.Department || row.department || 'CSE',
          year: Number(row.Year || row.year || 3),
          section: row.Section || row.section || 'A',
        },
        create: {
          registerNo: String(row.RegisterNo || row.registerNo || `REG_${Date.now()}_${Math.floor(Math.random()*1000)}`),
          name: row.Name || row.name || 'Student',
          email,
          role: 'STUDENT',
          department: row.Department || row.department || 'CSE',
          year: Number(row.Year || row.year || 3),
          section: row.Section || row.section || 'A',
        },
      });

      createdStudents.push(student);
    }

    return createdStudents;
  }
}
