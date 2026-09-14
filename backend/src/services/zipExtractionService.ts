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
 * Extracts a complete Question Bank package containing JSONL dataset(s) and figure assets.
 * Performs zip-slip validation, size boundaries, and maps figures by both relative path
 * (e.g. "figures/embedded_abc123.png") and normalized basename (e.g. "embedded_abc123.png").
 */
export function extractQuestionBankZipPackage(zipBuffer: Buffer): ExtractedQuestionPackage {
  const zip = new AdmZip(zipBuffer);
  const zipEntries = zip.getEntries();

  if (zipEntries.length > MAX_ENTRY_COUNT) {
    throw new Error(`ZIP package exceeds maximum entry limit (${zipEntries.length} > ${MAX_ENTRY_COUNT})`);
  }

  let totalExtractedSize = 0;
  const jsonlEntries: Array<{ fileName: string; entryPath: string; buffer: Buffer; text: string }> = [];
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

    if (ext === '.jsonl' || ext === '.txt') {
      jsonlEntries.push({
        fileName: baseName,
        entryPath: entryName,
        buffer: entryData,
        text: entryData.toString('utf-8'),
      });
    } else if (ALLOWED_FIGURE_EXTENSIONS.has(ext)) {
      const figureAsset: ExtractedFigureAsset = {
        fileName: baseName,
        entryPath: entryName,
        buffer: entryData,
        mimeType: inferImageMimeType(baseName),
      };

      // Map under full entry name ("figures/embedded_abc123.png"), lowercase path, and base name ("embedded_abc123.png")
      figureEntries.set(entryName, figureAsset);
      figureEntries.set(entryName.toLowerCase(), figureAsset);
      figureEntries.set(baseName, figureAsset);
      figureEntries.set(baseName.toLowerCase(), figureAsset);
      
      // Also index stripped "figures/" prefix if path starts with it
      if (entryName.startsWith('figures/')) {
        const withoutPrefix = entryName.slice('figures/'.length);
        figureEntries.set(withoutPrefix, figureAsset);
        figureEntries.set(withoutPrefix.toLowerCase(), figureAsset);
      }
    }
  }

  if (jsonlEntries.length === 0) {
    throw new Error('No valid .jsonl dataset files found in the uploaded ZIP package.');
  }

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

