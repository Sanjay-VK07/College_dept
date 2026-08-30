import xlsx from 'xlsx';
import { prisma } from '../config/prisma';
import { Role } from '@prisma/client';

/**
 * Dedicated Data Transfer Object (DTO) for Student Export.
 * Explicitly whitelists safe, relevant student fields to protect data privacy.
 */
export interface StudentExportRow {
  'Student ID': string;
  'Student Name': string;
  'Email': string;
  'Phone Number': string;
  'Course / Branch': string;
  'Year': string;
  'Semester': string;
  'Section': string;
  'Registration Date': string;
  'Total Exams Assigned': number;
  'Completed Exams': number;
  'Progress (%)': string;
  'Best Mock Score': string;
  'Average Mock Score': string;
  'Average Accuracy (%)': string;
  'Practice Attempts': number;
}

export class StudentDataExportService {
  /**
   * Queries real student records from the database, calculates performance
   * and progress metrics, and generates a formatted Excel (.xlsx) workbook buffer.
   */
  public static async generateExcel(): Promise<Buffer> {
    const students = await prisma.user.findMany({
      where: { role: Role.STUDENT },
      include: {
        assignments: {
          include: {
            test: {
              select: {
                id: true,
                title: true,
                totalMarks: true,
              },
            },
          },
        },
        aiPracticeAttempts: {
          select: {
            id: true,
            score: true,
            totalMarks: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const rows: StudentExportRow[] = students.map((student) => {
      const completedAssignments = student.assignments.filter(
        (a) => a.status === 'COMPLETED' || a.status === 'AUTO_SUBMITTED'
      );

      const totalAssigned = student.assignments.length;
      const completedCount = completedAssignments.length;

      // Progress: Percentage of assigned exams completed
      const progressPercent =
        totalAssigned > 0 ? `${Math.round((completedCount / totalAssigned) * 100)}%` : '0%';

      // Scores across completed exams
      const validScores = completedAssignments
        .map((a) => a.score)
        .filter((s): s is number => s !== null && s !== undefined);

      const bestScoreStr =
        validScores.length > 0 ? Math.max(...validScores).toFixed(2) : 'N/A';

      const avgScoreStr =
        validScores.length > 0
          ? (validScores.reduce((sum, s) => sum + s, 0) / validScores.length).toFixed(2)
          : 'N/A';

      // Accuracies across completed exams
      const validAccuracies = completedAssignments
        .map((a) => a.accuracy)
        .filter((acc): acc is number => acc !== null && acc !== undefined);

      const avgAccuracyStr =
        validAccuracies.length > 0
          ? `${(validAccuracies.reduce((sum, acc) => sum + acc, 0) / validAccuracies.length).toFixed(1)}%`
          : 'N/A';

      const regDate = student.createdAt
        ? new Date(student.createdAt).toISOString().split('T')[0]
        : 'N/A';

      return {
        'Student ID': student.registerNo || student.id,
        'Student Name': student.name,
        'Email': student.email,
        'Phone Number': 'N/A', // Schema does not store phone numbers
        'Course / Branch': student.department || 'N/A',
        'Year': student.year ? `Year ${student.year}` : 'N/A',
        'Semester': student.semester ? `Sem ${student.semester}` : 'N/A',
        'Section': student.section || 'N/A',
        'Registration Date': regDate,
        'Total Exams Assigned': totalAssigned,
        'Completed Exams': completedCount,
        'Progress (%)': progressPercent,
        'Best Mock Score': bestScoreStr,
        'Average Mock Score': avgScoreStr,
        'Average Accuracy (%)': avgAccuracyStr,
        'Practice Attempts': student.aiPracticeAttempts.length,
      };
    });

    // Handle case where 0 students exist in the database gracefully
    if (rows.length === 0) {
      const emptyRow: StudentExportRow = {
        'Student ID': 'No student records found in database',
        'Student Name': '',
        'Email': '',
        'Phone Number': '',
        'Course / Branch': '',
        'Year': '',
        'Semester': '',
        'Section': '',
        'Registration Date': '',
        'Total Exams Assigned': 0,
        'Completed Exams': 0,
        'Progress (%)': '0%',
        'Best Mock Score': 'N/A',
        'Average Mock Score': 'N/A',
        'Average Accuracy (%)': 'N/A',
        'Practice Attempts': 0,
      };
      rows.push(emptyRow);
    }

    const worksheet = xlsx.utils.json_to_sheet(rows);

    // Apply readable column widths
    worksheet['!cols'] = [
      { wch: 18 }, // Student ID
      { wch: 22 }, // Student Name
      { wch: 28 }, // Email
      { wch: 15 }, // Phone Number
      { wch: 30 }, // Course / Branch
      { wch: 10 }, // Year
      { wch: 10 }, // Semester
      { wch: 10 }, // Section
      { wch: 18 }, // Registration Date
      { wch: 22 }, // Total Exams Assigned
      { wch: 18 }, // Completed Exams
      { wch: 15 }, // Progress (%)
      { wch: 16 }, // Best Mock Score
      { wch: 18 }, // Average Mock Score
      { wch: 22 }, // Average Accuracy (%)
      { wch: 18 }, // Practice Attempts
    ];

    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Students');

    return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}
