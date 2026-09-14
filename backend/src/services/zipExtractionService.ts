import AdmZip from 'adm-zip';

export interface ExtractedZipEntry {
  fileName: string;
  buffer: Buffer;
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
    const fileName = entry.entryName.split('/').pop() || entry.entryName;
    if (!fileName || fileName.startsWith('.') || entry.entryName.includes('__MACOSX')) continue;

    const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
    if (!normalizedExts.includes(ext)) continue;

    entries.push({ fileName, buffer: entry.getData() });
  }
  return entries;
}

export function isZipFile(originalName: string, mimetype?: string): boolean {
  return (
    originalName.toLowerCase().endsWith('.zip') ||
    mimetype === 'application/zip' ||
    mimetype === 'application/x-zip-compressed'
  );
}
