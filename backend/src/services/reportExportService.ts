import xlsx from 'xlsx';
import PDFDocument from 'pdfkit';
import { prisma } from '../config/prisma';

export class ReportExportService {
  /**
   * Generates Excel workbook buffer for mock test results
   */
  public static async generateExcelReport(testId: string): Promise<Buffer> {
    const test = await prisma.mockTest.findUnique({
      where: { id: testId },
      include: {
        assignments: {
          include: {
            student: true,
          },
        },
      },
    });

    if (!test) throw new Error('Test not found');

    const dataRows = test.assignments.map(a => ({
      'Register Number': a.student.registerNo || 'N/A',
      'Student Name': a.student.name,
      'Email': a.student.email,
      'Department': a.student.department,
      'Year': a.student.year || 'N/A',
      'Section': a.student.section || 'N/A',
      'Score': a.score ?? 0,
      'Total Marks': test.totalMarks,
      'Accuracy (%)': a.accuracy ? `${a.accuracy.toFixed(1)}%` : '0%',
      'Time Taken (Min)': Math.round(a.timeTakenSec / 60),
      'Violation Count': a.violationCount,
      'Risk Level': a.riskLevel,
      'Status': a.status,
    }));

    const worksheet = xlsx.utils.json_to_sheet(dataRows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Results');

    return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  /**
   * Generates CSV string for mock test results
   */
  public static async generateCSVReport(testId: string): Promise<string> {
    const test = await prisma.mockTest.findUnique({
      where: { id: testId },
      include: {
        assignments: {
          include: {
            student: true,
          },
        },
      },
    });

    if (!test) throw new Error('Test not found');

    const headers = ['RegisterNo', 'Name', 'Email', 'Department', 'Score', 'TotalMarks', 'Accuracy', 'Violations', 'Status'];
    const rows = test.assignments.map(a => [
      `"${a.student.registerNo || ''}"`,
      `"${a.student.name}"`,
      `"${a.student.email}"`,
      `"${a.student.department}"`,
      a.score ?? 0,
      test.totalMarks,
      a.accuracy ? a.accuracy.toFixed(1) : 0,
      a.violationCount,
      a.status,
    ].join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Generates PDF document buffer for mock test results
   */
  public static async generatePDFReport(testId: string): Promise<Buffer> {
    const test = await prisma.mockTest.findUnique({
      where: { id: testId },
      include: {
        assignments: {
          include: {
            student: true,
          },
        },
      },
    });

    if (!test) throw new Error('Test not found');

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40 });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).text('GATE Secure Mock Test & Analytics System (GSMAS)', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(14).text(`Official Result Report: ${test.title}`, { align: 'center' });
      doc.fontSize(10).text(`Department: ${test.targetDepartment} | Duration: ${test.durationMinutes} mins | Total Marks: ${test.totalMarks}`, { align: 'center' });
      doc.moveDown(1.5);

      // Table Headers
      doc.fontSize(11).text('Reg No | Student Name | Department | Score | Violations | Status', { underline: true });
      doc.moveDown(0.5);

      test.assignments.forEach(a => {
        doc.fontSize(10).text(`${a.student.registerNo || 'N/A'} - ${a.student.name} (${a.student.department}) | Score: ${a.score ?? 0}/${test.totalMarks} | Violations: ${a.violationCount} | Status: ${a.status}`);
        doc.moveDown(0.3);
      });

      doc.end();
    });
  }
}
