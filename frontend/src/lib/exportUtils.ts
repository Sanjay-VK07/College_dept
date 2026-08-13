/**
 * CSV and PDF Export Utilities for Data Tables
 */

export function exportToCSV(filename: string, rows: Record<string, any>[]) {
  if (!rows || rows.length === 0) {
    alert('No data available to export.');
    return;
  }

  // Flatten object keys for CSV headers
  const getKeys = (obj: any, prefix = ''): string[] => {
    let keys: string[] = [];
    for (const key in obj) {
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        keys = keys.concat(getKeys(obj[key], `${prefix}${key}.`));
      } else {
        keys.push(`${prefix}${key}`);
      }
    }
    return keys;
  };

  const getValueByPath = (obj: any, path: string): any => {
    return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : ''), obj);
  };

  const headers = Array.from(new Set(rows.flatMap((r) => getKeys(r))));
  const csvRows: string[] = [];

  // Header row
  csvRows.push(headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','));

  // Data rows
  rows.forEach((row) => {
    const values = headers.map((h) => {
      const val = getValueByPath(row, h);
      const strVal = val === null || val === undefined ? '' : typeof val === 'object' ? JSON.stringify(val) : String(val);
      return `"${strVal.replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(','));
  });

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csvRows.join('\n'));
  const link = document.createElement('a');
  link.setAttribute('href', csvContent);
  link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function printOrExportPDF() {
  window.print();
}
