/**
 * Minimal RFC-4180-ish CSV parser + serializer. Shared by the import
 * wizard (client-side preview) and the import/export server actions, so
 * quoting behaviour is identical everywhere.
 */

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/** Parse CSV text into headers + rows, honoring quoted fields and escapes. */
export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  // Strip BOM if present.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      pushRow();
    } else {
      field += ch;
    }
  }
  // Trailing content without newline.
  if (field !== "" || row.length > 0) pushRow();

  const headers = rows[0]?.map((h) => h.trim()) ?? [];
  return { headers, rows: rows.slice(1).filter((r) => r.some((c) => c.trim() !== "")) };
}

/** Escape a single value for serialized CSV output. */
export function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Serialize rows (including an optional header row) to CSV text. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) lines.push(row.map(csvEscape).join(","));
  return lines.join("\r\n");
}
