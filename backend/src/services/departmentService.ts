import { Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import { CURRENT_INSTITUTION } from '../config/institution';

export { CURRENT_INSTITUTION };

export interface College {
  id: string;
  name: string;
  code: string;
  domain: string;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  collegeId: string;
  active: boolean;
  studentCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export const DEFAULT_COLLEGES: College[] = [
  {
    id: 'citchennai',
    name: 'Chennai Institute of Technology',
    code: 'CIT',
    domain: 'citchennai.net',
  },
  {
    id: 'uce',
    name: 'University College of Engineering',
    code: 'UCE',
    domain: 'college.edu.in',
  },
  {
    id: 'cit-auto',
    name: 'CIT Autonomous College',
    code: 'CIT-AUTO',
    domain: 'cit.edu.in',
  },
];

export const DEFAULT_DEPARTMENTS: Department[] = [
  // Fixed Institution: Chennai Institute of Technology (CIT)
  {
    id: 'dept-cse',
    code: 'CSE',
    name: 'Computer Science and Engineering',
    collegeId: 'citchennai',
    active: true,
  },
  {
    id: 'dept-ece',
    code: 'ECE',
    name: 'Electronics & Communication',
    collegeId: 'citchennai',
    active: true,
  },
  {
    id: 'dept-it',
    code: 'IT',
    name: 'Information Technology',
    collegeId: 'citchennai',
    active: true,
  },
  {
    id: 'dept-aids',
    code: 'AI&DS',
    name: 'Artificial Intelligence and Data Science',
    collegeId: 'citchennai',
    active: true,
  },
  {
    id: 'dept-bme',
    code: 'BME',
    name: 'Biomedical Engineering',
    collegeId: 'citchennai',
    active: true,
  },
  {
    id: 'dept-mech',
    code: 'MECH',
    name: 'Mechanical Engineering',
    collegeId: 'citchennai',
    active: true,
  },
  {
    id: 'dept-eee',
    code: 'EEE',
    name: 'Electrical and Electronics Engineering',
    collegeId: 'citchennai',
    active: true,
  },
  {
    id: 'dept-civil',
    code: 'CIVIL',
    name: 'Civil Engineering',
    collegeId: 'citchennai',
    active: true,
  },
  {
    id: 'dept-biotech',
    code: 'BIOTECH',
    name: 'Biotechnology',
    collegeId: 'citchennai',
    active: true,
  },
  // Preserved records for other colleges (non-destructive)
  {
    id: 'dept-uce-civil',
    code: 'CIVIL',
    name: 'Civil Engineering',
    collegeId: 'uce',
    active: true,
  },
  {
    id: 'dept-uce-mech',
    code: 'MECH',
    name: 'Mechanical Engineering',
    collegeId: 'uce',
    active: true,
  },
  {
    id: 'dept-uce-eee',
    code: 'EEE',
    name: 'Electrical and Electronics Engineering',
    collegeId: 'uce',
    active: true,
  },
  {
    id: 'dept-uce-biotech',
    code: 'BIOTECH',
    name: 'Biotechnology',
    collegeId: 'uce',
    active: true,
  },
];

const SETTING_KEY_DEPARTMENTS = 'INSTITUTION_DEPARTMENTS';
const SETTING_KEY_COLLEGES = 'INSTITUTION_COLLEGES';

export class DepartmentService {
  /**
   * Retrieves all colleges configured for the institution.
   */
  public static async getColleges(): Promise<College[]> {
    try {
      const setting = await prisma.systemSetting.findUnique({
        where: { key: SETTING_KEY_COLLEGES },
      });

      if (setting && setting.value) {
        return JSON.parse(setting.value);
      }

      // Initialize with default colleges
      await prisma.systemSetting.upsert({
        where: { key: SETTING_KEY_COLLEGES },
        update: { value: JSON.stringify(DEFAULT_COLLEGES) },
        create: {
          key: SETTING_KEY_COLLEGES,
          value: JSON.stringify(DEFAULT_COLLEGES),
          description: 'Configured colleges / institutions for examination system',
        },
      });

      return DEFAULT_COLLEGES;
    } catch (err) {
      return DEFAULT_COLLEGES;
    }
  }

  /**
   * Retrieves raw departments array from SystemSetting.
   */
  public static async getRawDepartments(): Promise<Department[]> {
    try {
      const setting = await prisma.systemSetting.findUnique({
        where: { key: SETTING_KEY_DEPARTMENTS },
      });

      if (setting && setting.value) {
        const parsed: Department[] = JSON.parse(setting.value);
        // Ensure CIT has its standard institutional departments from DEFAULT_DEPARTMENTS without deleting existing records
        const citDepts = parsed.filter((d) => d.collegeId === CURRENT_INSTITUTION.id);
        const requiredCit = DEFAULT_DEPARTMENTS.filter((d) => d.collegeId === CURRENT_INSTITUTION.id);
        let updated = false;

        for (const reqDept of requiredCit) {
          const exists = citDepts.some(
            (d) => d.code === reqDept.code || d.name.toLowerCase() === reqDept.name.toLowerCase()
          );
          if (!exists) {
            parsed.push({
              ...reqDept,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            updated = true;
          }
        }

        if (updated) {
          await prisma.systemSetting.update({
            where: { key: SETTING_KEY_DEPARTMENTS },
            data: { value: JSON.stringify(parsed) },
          });
        }

        return parsed;
      }

      // Initialize with default departments
      await prisma.systemSetting.upsert({
        where: { key: SETTING_KEY_DEPARTMENTS },
        update: { value: JSON.stringify(DEFAULT_DEPARTMENTS) },
        create: {
          key: SETTING_KEY_DEPARTMENTS,
          value: JSON.stringify(DEFAULT_DEPARTMENTS),
          description: 'Configured master departments with college association',
        },
      });

      return DEFAULT_DEPARTMENTS;
    } catch (err) {
      return DEFAULT_DEPARTMENTS;
    }
  }

  /**
   * Retrieves departments with live student counts calculated directly from user records.
   * Can be filtered by collegeId and/or active status.
   */
  public static async getDepartments(filters?: { collegeId?: string; activeOnly?: boolean }): Promise<Department[]> {
    const rawDepartments = await this.getRawDepartments();

    // Default to CURRENT_INSTITUTION (citchennai) unless 'ALL' or a specific collegeId is explicitly requested
    const targetCollegeId = filters?.collegeId !== undefined ? filters.collegeId : CURRENT_INSTITUTION.id;
    let filtered = rawDepartments;
    if (targetCollegeId && targetCollegeId !== 'ALL') {
      filtered = filtered.filter((d) => d.collegeId === targetCollegeId);
    }
    if (filters?.activeOnly) {
      filtered = filtered.filter((d) => d.active);
    }

    // Query live student counts from database in a single query
    const studentCounts = await prisma.user.groupBy({
      by: ['department'],
      where: { role: Role.STUDENT },
      _count: { id: true },
    });

    const countMap = new Map<string, number>();
    for (const item of studentCounts) {
      if (item.department) {
        countMap.set(item.department.toLowerCase(), item._count.id);
      }
    }

    const enriched = filtered.map((dept) => {
      const count =
        (countMap.get(dept.name.toLowerCase()) || 0) +
        (countMap.get(dept.code.toLowerCase()) || 0) +
        (countMap.get(dept.id.toLowerCase()) || 0);

      return {
        ...dept,
        studentCount: count,
      };
    });

    return enriched;
  }

  /**
   * Creates a new department in the master list.
   */
  public static async createDepartment(data: {
    code: string;
    name: string;
    collegeId?: string;
    active?: boolean;
  }): Promise<Department> {
    const rawDepartments = await this.getRawDepartments();

    const normalizedCode = data.code.trim().toUpperCase();
    const normalizedName = data.name.trim();
    const collegeId = data.collegeId || CURRENT_INSTITUTION.id;
    const active = data.active !== undefined ? data.active : true;

    // Check duplicate code within the same college
    const existing = rawDepartments.find(
      (d) => d.collegeId === collegeId && (d.code === normalizedCode || d.name.toLowerCase() === normalizedName.toLowerCase())
    );

    if (existing) {
      throw new Error(`Department with code ${normalizedCode} or name "${normalizedName}" already exists for this college`);
    }

    const newDept: Department = {
      id: `dept-${normalizedCode.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString().slice(-4)}`,
      code: normalizedCode,
      name: normalizedName,
      collegeId,
      active,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedList = [...rawDepartments, newDept];

    await prisma.systemSetting.upsert({
      where: { key: SETTING_KEY_DEPARTMENTS },
      update: { value: JSON.stringify(updatedList) },
      create: {
        key: SETTING_KEY_DEPARTMENTS,
        value: JSON.stringify(updatedList),
        description: 'Configured master departments with college association',
      },
    });

    return { ...newDept, studentCount: 0 };
  }

  /**
   * Updates an existing department.
   */
  public static async updateDepartment(
    id: string,
    data: Partial<{ code: string; name: string; collegeId: string; active: boolean }>
  ): Promise<Department> {
    const rawDepartments = await this.getRawDepartments();

    const index = rawDepartments.findIndex((d) => d.id === id);
    if (index === -1) {
      throw new Error(`Department not found with ID ${id}`);
    }

    const current = rawDepartments[index];
    const updated: Department = {
      ...current,
      code: data.code ? data.code.trim().toUpperCase() : current.code,
      name: data.name ? data.name.trim() : current.name,
      collegeId: data.collegeId !== undefined ? data.collegeId : current.collegeId,
      active: data.active !== undefined ? data.active : current.active,
      updatedAt: new Date().toISOString(),
    };

    rawDepartments[index] = updated;

    await prisma.systemSetting.upsert({
      where: { key: SETTING_KEY_DEPARTMENTS },
      update: { value: JSON.stringify(rawDepartments) },
      create: {
        key: SETTING_KEY_DEPARTMENTS,
        value: JSON.stringify(rawDepartments),
        description: 'Configured master departments with college association',
      },
    });

    // Get live count
    const studentCount = await prisma.user.count({
      where: {
        role: Role.STUDENT,
        OR: [
          { department: { equals: updated.name, mode: 'insensitive' } },
          { department: { equals: updated.code, mode: 'insensitive' } },
          { department: { equals: updated.id, mode: 'insensitive' } },
        ],
      },
    });

    return { ...updated, studentCount };
  }

  /**
   * Deletes a department from the master list.
   */
  public static async deleteDepartment(id: string): Promise<boolean> {
    const rawDepartments = await this.getRawDepartments();

    const dept = rawDepartments.find((d) => d.id === id);
    if (!dept) {
      throw new Error(`Department not found with ID ${id}`);
    }

    // Check if department has students enrolled
    const studentCount = await prisma.user.count({
      where: {
        role: Role.STUDENT,
        OR: [
          { department: { equals: dept.name, mode: 'insensitive' } },
          { department: { equals: dept.code, mode: 'insensitive' } },
          { department: { equals: dept.id, mode: 'insensitive' } },
        ],
      },
    });

    if (studentCount > 0) {
      throw new Error(`Cannot delete department "${dept.name}" because it has ${studentCount} active student records. Consider marking it inactive instead.`);
    }

    const updatedList = rawDepartments.filter((d) => d.id !== id);

    await prisma.systemSetting.upsert({
      where: { key: SETTING_KEY_DEPARTMENTS },
      update: { value: JSON.stringify(updatedList) },
      create: {
        key: SETTING_KEY_DEPARTMENTS,
        value: JSON.stringify(updatedList),
        description: 'Configured master departments with college association',
      },
    });

    return true;
  }
}
