type ColData = { value?: unknown };

type ReportColumn = {
  ColTitle?: unknown;
  ColType?: unknown;
  MetaData?: Array<{ Name?: unknown; Value?: unknown }>;
};

type ReportRow = {
  type?: unknown;
  group?: unknown;
  ColData?: ColData[];
  Header?: { ColData?: ColData[] };
  Rows?: { Row?: ReportRow[] } | ReportRow[];
  Summary?: { ColData?: ColData[] };
};

type ProfitAndLossReport = {
  Header?: Record<string, unknown>;
  Columns?: { Column?: ReportColumn[] } | ReportColumn[];
  Rows?: { Row?: ReportRow[] } | ReportRow[];
};

export interface NormalizedProfitAndLoss {
  verified: boolean;
  currency: string | null;
  startPeriod: string | null;
  endPeriod: string | null;
  accountingMethod: string | null;
  periods: Array<{
    key: string;
    title: string;
    startDate: string | null;
    endDate: string | null;
    isTotal: boolean;
  }>;
  sections: Record<string, Record<string, string>>;
  checks: Array<{ name: string; status: "passed" | "failed"; message: string }>;
  errors: string[];
}

type MoneyColumn = NormalizedProfitAndLoss["periods"][number] & { index: number };

function asArray<T>(value: { Row?: T[] } | T[] | undefined): T[] {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.Row) ? value.Row : [];
}

function asColumns(value: { Column?: ReportColumn[] } | ReportColumn[] | undefined): ReportColumn[] {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.Column) ? value.Column : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function metadataValue(column: ReportColumn, name: string): string | null {
  const item = column.MetaData?.find((entry) => stringValue(entry.Name).toLowerCase() === name.toLowerCase());
  const value = stringValue(item?.Value);
  return value || null;
}

function parseMoneyToCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100);
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return 0;

  const negative = /^\(.*\)$/.test(trimmed);
  const normalized = trimmed.replace(/[,$()\s]/g, "");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Math.round((negative ? -Math.abs(parsed) : parsed) * 100);
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function cellCents(colData: ColData[] | undefined, index: number): number | null {
  return parseMoneyToCents(colData?.[index]?.value);
}

function detailTotal(row: ReportRow, columnIndex: number): { cents: number; hasDetail: boolean } {
  if (stringValue(row.type).toLowerCase() === "data") {
    return { cents: cellCents(row.ColData, columnIndex) ?? 0, hasDetail: true };
  }

  let cents = 0;
  let hasDetail = false;
  const headerValue = cellCents(row.Header?.ColData, columnIndex);
  if (headerValue !== null && headerValue !== 0) {
    cents += headerValue;
    hasDetail = true;
  }

  for (const child of asArray(row.Rows)) {
    const detail = detailTotal(child, columnIndex);
    cents += detail.cents;
    hasDetail ||= detail.hasDetail;
  }

  return { cents, hasDetail };
}

function findGroup(rows: ReportRow[], group: string): ReportRow | undefined {
  return rows.find((row) => stringValue(row.group).toLowerCase() === group.toLowerCase());
}

function sectionValue(row: ReportRow | undefined, columnIndex: number): number | null {
  if (!row) return null;
  return cellCents(row.Summary?.ColData, columnIndex);
}

function moneyColumns(report: ProfitAndLossReport): MoneyColumn[] {
  return asColumns(report.Columns)
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => stringValue(column.ColType).toLowerCase() === "money")
    .map(({ column, index }) => {
      const colKey = metadataValue(column, "ColKey") || stringValue(column.ColTitle) || `column-${index}`;
      const title = stringValue(column.ColTitle) || colKey;
      const isTotal = colKey.toLowerCase() === "total" || title.toLowerCase() === "total";
      return {
        index,
        key: colKey,
        title,
        startDate: metadataValue(column, "StartDate"),
        endDate: metadataValue(column, "EndDate"),
        isTotal,
      };
    });
}

export function normalizeProfitAndLossReport(input: unknown): NormalizedProfitAndLoss {
  const report = (input && typeof input === "object" ? input : {}) as ProfitAndLossReport;
  const rows = asArray(report.Rows);
  const columns = moneyColumns(report);
  const checks: NormalizedProfitAndLoss["checks"] = [];
  const errors: string[] = [];
  const sections: NormalizedProfitAndLoss["sections"] = {};

  if (stringValue(report.Header?.ReportName) !== "ProfitAndLoss") errors.push("Response is not a ProfitAndLoss report.");
  if (columns.length === 0) errors.push("Report contains no money columns.");

  const groups = ["Income", "COGS", "GrossProfit", "Expenses", "NetOperatingIncome", "OtherIncome", "OtherExpenses", "NetOtherIncome", "NetIncome"];
  for (const group of groups) {
    const row = findGroup(rows, group);
    if (!row) continue;
    sections[group] = {};
    for (const column of columns) {
      const value = sectionValue(row, column.index);
      if (value !== null) sections[group][column.key] = formatCents(value);
    }
  }

  const requiredGroups = ["Income", "Expenses", "NetIncome"];
  for (const group of requiredGroups) {
    if (!findGroup(rows, group)) errors.push(`Missing required ${group} summary section.`);
  }

  const totalColumn = columns.find((column) => column.isTotal) ?? (columns.length === 1 ? columns[0] : undefined);
  if (!totalColumn) errors.push("Report has multiple money columns but no unambiguous Total column.");
  if (totalColumn) {
    for (const group of requiredGroups) {
      if (sectionValue(findGroup(rows, group), totalColumn.index) === null) {
        errors.push(`${group} has no numeric summary for ${totalColumn.title}.`);
      }
    }
  }

  for (const group of ["Income", "COGS", "Expenses", "OtherIncome", "OtherExpenses"]) {
    const row = findGroup(rows, group);
    if (!row) continue;
    for (const column of columns) {
      const summary = sectionValue(row, column.index);
      const detail = detailTotal(row, column.index);
      if (summary === null) {
        checks.push({
          name: `${group} detail reconciliation (${column.title})`,
          status: "failed",
          message: `${group} has no numeric summary for ${column.title}.`,
        });
        continue;
      }
      if (!detail.hasDetail) {
        if (summary !== 0) {
          checks.push({
            name: `${group} detail reconciliation (${column.title})`,
            status: "failed",
            message: `${group} summary is ${formatCents(summary)}, but no detail is available to reconcile it.`,
          });
        }
        continue;
      }
      const passed = summary === detail.cents;
      checks.push({
        name: `${group} detail reconciliation (${column.title})`,
        status: passed ? "passed" : "failed",
        message: passed
          ? `${formatCents(detail.cents)} reconciles to the section summary.`
          : `Detail ${formatCents(detail.cents)} does not equal summary ${formatCents(summary)}.`,
      });
    }
  }

  if (totalColumn) {
    const periodColumns = columns.filter((column) => !column.isTotal);
    if (periodColumns.length > 0) {
      for (const group of Object.keys(sections)) {
        const row = findGroup(rows, group);
        const total = sectionValue(row, totalColumn.index);
        const periodValues = periodColumns.map((column) => sectionValue(row, column.index));
        if (total === null || periodValues.some((value) => value === null)) continue;
        const periodSum = (periodValues as number[]).reduce((sum, value) => sum + value, 0);
        const passed = periodSum === total;
        checks.push({
          name: `${group} period reconciliation`,
          status: passed ? "passed" : "failed",
          message: passed
            ? `Periods sum to Total ${formatCents(total)}.`
            : `Periods sum to ${formatCents(periodSum)}, not Total ${formatCents(total)}.`,
        });
      }
    }

    const income = sectionValue(findGroup(rows, "Income"), totalColumn.index);
    const expenses = sectionValue(findGroup(rows, "Expenses"), totalColumn.index);
    const netIncome = sectionValue(findGroup(rows, "NetIncome"), totalColumn.index);
    if (income !== null && expenses !== null && netIncome !== null) {
      const cogs = sectionValue(findGroup(rows, "COGS"), totalColumn.index) ?? 0;
      const otherIncome = sectionValue(findGroup(rows, "OtherIncome"), totalColumn.index) ?? 0;
      const otherExpenses = sectionValue(findGroup(rows, "OtherExpenses"), totalColumn.index) ?? 0;
      const calculated = income - cogs - expenses + otherIncome - otherExpenses;
      const passed = calculated === netIncome;
      checks.push({
        name: "Net income reconciliation",
        status: passed ? "passed" : "failed",
        message: passed
          ? `Income less costs and expenses reconciles to Net Income ${formatCents(netIncome)}.`
          : `Calculated Net Income ${formatCents(calculated)} does not equal reported ${formatCents(netIncome)}.`,
      });
    }
  }

  for (const check of checks.filter((item) => item.status === "failed")) errors.push(check.message);
  if (checks.length === 0) errors.push("No report reconciliation checks could be performed.");

  return {
    verified: errors.length === 0,
    currency: stringValue(report.Header?.Currency) || null,
    startPeriod: stringValue(report.Header?.StartPeriod) || null,
    endPeriod: stringValue(report.Header?.EndPeriod) || null,
    accountingMethod: stringValue(report.Header?.ReportBasis) || null,
    periods: columns.map(({ index: _index, ...column }) => column),
    sections,
    checks,
    errors,
  };
}

