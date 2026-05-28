/** Shared CSV parse + header normalization for Google Sheet / Drive CSV sync. */

export function normalizeHeader(h: string) {
  return String(h ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase();
}

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const cols: string[] = [];
  let cur = "";
  let inQuote = false;

  for (let i = 0; i <= text.length; i++) {
    const ch = i < text.length ? text[i] : "\n";
    if (ch === '"') {
      if (inQuote && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      cols.push(cur);
      cur = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuote) {
      cols.push(cur);
      cur = "";
      if (cols.length > 1 || cols[0] !== "") rows.push([...cols]);
      cols.length = 0;
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else {
      cur += ch;
    }
  }

  return rows;
}

export const REQUIRED_SHEET_HEADERS = ["id", "name"] as const;

export function validateSheetRows(rows: string[][]): {
  ok: boolean;
  issues: string[];
  headers: string[];
  dataRowCount: number;
  rowsWithName: number;
} {
  const issues: string[] = [];
  if (rows.length < 2) {
    return {
      ok: false,
      issues: ["File looks empty (needs a header row plus at least one data row)."],
      headers: [],
      dataRowCount: 0,
      rowsWithName: 0,
    };
  }

  const headers = (rows[0] ?? []).map(normalizeHeader);
  const missing = REQUIRED_SHEET_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length) {
    issues.push(`Missing required column(s): ${missing.join(", ")}`);
  }

  const nameIdx = headers.indexOf("name");
  let rowsWithName = 0;
  if (nameIdx >= 0) {
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i]?.[nameIdx] ?? "").trim()) rowsWithName++;
    }
    if (rows.length > 1 && rowsWithName === 0) {
      issues.push("No data rows have a value in the name column — sync would import 0 listings.");
    }
  }

  const idIdx = headers.indexOf("id");
  if (idIdx >= 0) {
    const seen = new Set<string>();
    for (let i = 1; i < Math.min(rows.length, 2001); i++) {
      const id = String(rows[i]?.[idIdx] ?? "").trim();
      if (!id) continue;
      if (seen.has(id)) {
        issues.push(`Duplicate id found: ${id}`);
        break;
      }
      seen.add(id);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    headers,
    dataRowCount: Math.max(0, rows.length - 1),
    rowsWithName,
  };
}
