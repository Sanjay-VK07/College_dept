import AdmZip from 'adm-zip';
import path from 'path';

export interface ExtractedZipEntry {
  fileName: string;
  entryPath: string;
  buffer: Buffer;
}

export interface ExtractedFigureAsset {
  fileName: string;
  entryPath: string;
  buffer: Buffer;
  mimeType: string;
}

export interface ExtractedQuestionPackage {
  jsonlEntries: Array<{ fileName: string; entryPath: string; buffer: Buffer; text: string }>;
  figureEntries: Map<string, ExtractedFigureAsset>;
  allEntryPaths: string[];
  totalSize: number;
}

const ALLOWED_FIGURE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif']);
const DANGEROUS_EXTENSIONS = new Set(['.exe', '.bat', '.cmd', '.sh', '.dll', '.so', '.dylib', '.ps1', '.vbs', '.js', '.ts', '.bin', '.com', '.msi']);
const MAX_TOTAL_EXTRACTED_BYTES = 150 * 1024 * 1024; // 150 MB safety ceiling
const MAX_ENTRY_COUNT = 5000;

function inferImageMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.svg': return 'image/svg+xml';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    default: return 'application/octet-stream';
  }
}

/**
 * Validates against zip-slip and directory traversal attacks.
 */
export function isSafeZipEntry(entryName: string): boolean {
  if (!entryName || typeof entryName !== 'string') return false;
  // Disallow absolute paths, drive letters, and parent directory traversal
  const normalized = entryName.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) return false;
  const segments = normalized.split('/');
  if (segments.includes('..') || segments.includes('.')) return false;
  return true;
}

/**
 * Extracts every entry from a .zip buffer whose extension is in `allowedExtensions`,
 * skipping directories, macOS resource-fork junk (__MACOSX/, .DS_Store), and dotfiles.
 */
export function extractZipEntries(zipBuffer: Buffer, allowedExtensions: string[]): ExtractedZipEntry[] {
  const zip = new AdmZip(zipBuffer);
  const normalizedExts = allowedExtensions.map((ext) => ext.toLowerCase());

  const entries: ExtractedZipEntry[] = [];
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    if (!isSafeZipEntry(entry.entryName)) continue;

    const baseName = entry.entryName.split('/').pop() || entry.entryName;
    if (!baseName || baseName.startsWith('.') || entry.entryName.includes('__MACOSX')) continue;

    const ext = baseName.slice(baseName.lastIndexOf('.')).toLowerCase();
    if (DANGEROUS_EXTENSIONS.has(ext)) continue;
    if (!normalizedExts.includes(ext)) continue;

    entries.push({ fileName: baseName, entryPath: entry.entryName, buffer: entry.getData() });
  }
  return entries;
}

/**
 * Helper to check if an object or string content represents question records.
 */
function hasQuestionFields(obj: any): boolean {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  return Boolean(
    obj.questionId ||
    obj.question ||
    obj.text ||
    obj.options ||
    obj.questionType ||
    obj.rawAnswer ||
    obj.correctAnswer ||
    obj.chapter
  );
}

export function isQuestionDatasetContent(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.some((item) => hasQuestionFields(item));
    }
    if (typeof parsed === 'object' && parsed !== null) {
      return hasQuestionFields(parsed);
    }
  } catch (e) {
    // Fallback to line-by-line check
  }

  const lines = trimmed.split('\n');
  let validCount = 0;
  for (const line of lines) {
    const lTrim = line.trim();
    if (!lTrim) continue;
    try {
      const obj = JSON.parse(lTrim);
      if (hasQuestionFields(obj)) {
        validCount++;
      }
    } catch (e) {
      // ignore line errors
    }
  }
  return validCount > 0;
}

/**
 * Registers a figure asset under all relevant normalized keys.
 */
function registerFigureAsset(
  map: Map<string, ExtractedFigureAsset>,
  entryName: string,
  baseName: string,
  asset: ExtractedFigureAsset
) {
  const cleanPath = entryName.replace(/\\/g, '/');

  const addKey = (k: string) => {
    if (!k) return;
    const norm = k.trim().replace(/^\.\//, '').replace(/^\//, '');
    if (!norm) return;
    map.set(norm, asset);
    map.set(norm.toLowerCase(), asset);
  };

  addKey(cleanPath);
  addKey(baseName);

  // Synthetic references
  addKey(`figures/${baseName}`);
  addKey(`visuals/${baseName}`);

  // Stripped folder prefixes (e.g. figures/ or visuals/ or GATE_questions_and_visuals/visuals/)
  const dirMatch = cleanPath.match(/(?:^|\/)(figures|visuals)\/(.+)$/i);
  if (dirMatch) {
    const subPath = dirMatch[2];
    addKey(subPath);
    addKey(`figures/${subPath}`);
    addKey(`visuals/${subPath}`);
  }
}

/**
 * Extracts a complete Question Bank package containing JSONL or JSON dataset(s) and figure/visual assets.
 * Performs zip-slip validation, size boundaries, and maps figures by relative paths and basenames.
 */
export function extractQuestionBankZipPackage(zipBuffer: Buffer): ExtractedQuestionPackage {
  const zip = new AdmZip(zipBuffer);
  const zipEntries = zip.getEntries();

  if (zipEntries.length > MAX_ENTRY_COUNT) {
    throw new Error(`ZIP package exceeds maximum entry limit (${zipEntries.length} > ${MAX_ENTRY_COUNT})`);
  }

  let totalExtractedSize = 0;
  const candidateDatasets: Array<{
    fileName: string;
    entryPath: string;
    buffer: Buffer;
    text: string;
    ext: string;
  }> = [];

  const figureEntries = new Map<string, ExtractedFigureAsset>();
  const allEntryPaths: string[] = [];

  for (const entry of zipEntries) {
    if (entry.isDirectory) continue;

    const entryName = entry.entryName.replace(/\\/g, '/');
    if (!isSafeZipEntry(entryName)) {
      throw new Error(`Security Violation: Unsafe entry path detected in ZIP package (${entry.entryName})`);
    }

    const baseName = path.posix.basename(entryName);
    if (!baseName || baseName.startsWith('.') || entryName.includes('__MACOSX')) continue;

    const ext = path.posix.extname(baseName).toLowerCase();
    if (DANGEROUS_EXTENSIONS.has(ext)) {
      throw new Error(`Security Violation: Disallowed executable or dangerous file type detected (${baseName})`);
    }

    const entryData = entry.getData();
    totalExtractedSize += entryData.length;
    if (totalExtractedSize > MAX_TOTAL_EXTRACTED_BYTES) {
      throw new Error(`ZIP package exceeds maximum uncompressed size of ${MAX_TOTAL_EXTRACTED_BYTES / (1024 * 1024)}MB`);
    }

    allEntryPaths.push(entryName);

    if (ext === '.jsonl' || ext === '.json' || ext === '.txt') {
      candidateDatasets.push({
        fileName: baseName,
        entryPath: entryName,
        buffer: entryData,
        text: entryData.toString('utf-8'),
        ext,
      });
    } else if (ALLOWED_FIGURE_EXTENSIONS.has(ext)) {
      const figureAsset: ExtractedFigureAsset = {
        fileName: baseName,
        entryPath: entryName,
        buffer: entryData,
        mimeType: inferImageMimeType(baseName),
      };

      registerFigureAsset(figureEntries, entryName, baseName, figureAsset);
    }
  }

  // Filter candidates by valid question content
  const validCandidates = candidateDatasets.filter((c) => isQuestionDatasetContent(c.text));

  // Prefer valid .jsonl datasets first, then .json, then .txt
  const jsonlCandidates = validCandidates.filter((c) => c.ext === '.jsonl');
  const jsonCandidates = validCandidates.filter((c) => c.ext === '.json');
  const txtCandidates = validCandidates.filter((c) => c.ext === '.txt');

  const selectedCandidates =
    jsonlCandidates.length > 0
      ? jsonlCandidates
      : jsonCandidates.length > 0
      ? jsonCandidates
      : txtCandidates;

  if (selectedCandidates.length === 0) {
    throw new Error('No supported question dataset found. Expected .jsonl or .json containing question records.');
  }

  const jsonlEntries = selectedCandidates.map((c) => ({
    fileName: c.fileName,
    entryPath: c.entryPath,
    buffer: c.buffer,
    text: c.text,
  }));

  return {
    jsonlEntries,
    figureEntries,
    allEntryPaths,
    totalSize: totalExtractedSize,
  };
}

export function isZipFile(originalName: string, mimetype?: string): boolean {
  return (
    originalName.toLowerCase().endsWith('.zip') ||
    mimetype === 'application/zip' ||
    mimetype === 'application/x-zip-compressed' ||
    (mimetype === 'application/octet-stream' && originalName.toLowerCase().endsWith('.zip'))
  );
}


