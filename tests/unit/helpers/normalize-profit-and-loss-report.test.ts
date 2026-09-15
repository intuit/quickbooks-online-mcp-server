import { describe, expect, it } from "@jest/globals";
import { normalizeProfitAndLossReport } from "../../../src/helpers/normalize-profit-and-loss-report";

function report(monthly = false): any {
  const columns = monthly
    ? [
        { ColTitle: "", ColType: "Account", MetaData: [{ Name: "ColKey", Value: "account" }] },
        { ColTitle: "Jan 2026", ColType: "Money", MetaData: [{ Name: "ColKey", Value: "Jan 2026" }] },
        { ColTitle: "Feb 2026", ColType: "Money", MetaData: [{ Name: "ColKey", Value: "Feb 2026" }] },
        { ColTitle: "Total", ColType: "Money", MetaData: [{ Name: "ColKey", Value: "total" }] },
      ]
    : [
        { ColTitle: "", ColType: "Account", MetaData: [{ Name: "ColKey", Value: "account" }] },
        { ColTitle: "Total", ColType: "Money", MetaData: [{ Name: "ColKey", Value: "total" }] },
      ];
  const values = (label: string, total: string, jan = total, feb = "0.00") => ({
    ColData: monthly
      ? [{ value: label }, { value: jan }, { value: feb }, { value: total }]
      : [{ value: label }, { value: total }],
  });

  return {
    Header: {
      ReportName: "ProfitAndLoss",
      ReportBasis: "Cash",
      StartPeriod: "2026-01-01",
      EndPeriod: "2026-02-28",
      Currency: "USD",
    },
    Columns: { Column: columns },
    Rows: {
      Row: [
        {
          Header: values("Income", "0.00", "0.00", "0.00"),
          Rows: {
            Row: [
              { type: "Data", ...values("Ministry Support", "18359.16", "10000.00", "8359.16") },
              { type: "Data", ...values("Chainsaw Donations", "1600.00", "1600.00", "0.00") },
            ],
          },
          Summary: values("Total Income", "19959.16", "11600.00", "8359.16"),
          type: "Section",
          group: "Income",
        },
        {
          Header: values("Expenses", "0.00", "0.00", "0.00"),
          Rows: {
            Row: [
              {
                Header: values("ECDR Expenses", "0.00", "0.00", "0.00"),
                Rows: {
                  Row: [
                    { type: "Data", ...values("Truck", "2652.94", "1000.00", "1652.94") },
                    { type: "Data", ...values("Unidentified Unit", "-700.00", "-700.00", "0.00") },
                  ],
                },
                Summary: values("Total ECDR Expenses", "1952.94", "300.00", "1652.94"),
                type: "Section",
              },
              { type: "Data", ...values("Other Expenses", "6258.89", "3000.00", "3258.89") },
            ],
          },
          Summary: values("Total Expenses", "8211.83", "3300.00", "4911.83"),
          type: "Section",
          group: "Expenses",
        },
        {
          Summary: values("Net Income", "11747.33", "8300.00", "3447.33"),
          type: "Section",
          group: "NetIncome",
        },
      ],
    },
  };
}

describe("normalizeProfitAndLossReport", () => {
  it("reads totals from Summary rather than zero-valued section headers", () => {
    const result = normalizeProfitAndLossReport(report());

    expect(result.verified).toBe(true);
    expect(result.sections.Income.total).toBe("19959.16");
    expect(result.sections.Expenses.total).toBe("8211.83");
    expect(result.sections.NetIncome.total).toBe("11747.33");
  });

  it("does not add monthly columns to the Total column", () => {
    const result = normalizeProfitAndLossReport(report(true));

    expect(result.verified).toBe(true);
    expect(result.sections.Income.total).toBe("19959.16");
    expect(result.checks).toContainEqual({
      name: "Income period reconciliation",
      status: "passed",
      message: "Periods sum to Total 19959.16.",
    });
  });

  it("handles parenthesized negative values", () => {
    const input = report();
    input.Rows.Row[1].Rows.Row[0].Rows.Row[1].ColData[1].value = "(700.00)";

    const result = normalizeProfitAndLossReport(input);

    expect(result.verified).toBe(true);
  });

  it("fails closed when a section summary does not reconcile", () => {
    const input = report();
    input.Rows.Row[1].Summary.ColData[1].value = "0.00";

    const result = normalizeProfitAndLossReport(input);

    expect(result.verified).toBe(false);
    expect(result.errors).toContain("Detail 8211.83 does not equal summary 0.00.");
  });

  it("fails closed when monthly values do not reconcile to Total", () => {
    const input = report(true);
    input.Rows.Row[0].Summary.ColData[3].value = "39918.32";

    const result = normalizeProfitAndLossReport(input);

    expect(result.verified).toBe(false);
    expect(result.errors).toContain("Periods sum to 19959.16, not Total 39918.32.");
  });

  it("includes direct activity held in a nested section header", () => {
    const input = report();
    input.Rows.Row[1].Rows.Row[0].Header.ColData[1].value = "100.00";
    input.Rows.Row[1].Rows.Row[0].Summary.ColData[1].value = "2052.94";
    input.Rows.Row[1].Summary.ColData[1].value = "8311.83";
    input.Rows.Row[2].Summary.ColData[1].value = "11647.33";

    const result = normalizeProfitAndLossReport(input);

    expect(result.verified).toBe(true);
    expect(result.sections.Expenses.total).toBe("8311.83");
  });

  it("accepts numeric money cells and treats an invalid detail cell as zero", () => {
    const input = report();
    input.Rows.Row[0].Rows.Row[0].ColData[1].value = 18359.16;
    input.Rows.Row[0].Rows.Row[1].ColData[1].value = Number.POSITIVE_INFINITY;
    input.Rows.Row[0].Summary.ColData[1].value = 18359.16;
    input.Rows.Row[2].Summary.ColData[1].value = 10147.33;

    const result = normalizeProfitAndLossReport(input);

    expect(result.verified).toBe(true);
    expect(result.sections.Income.total).toBe("18359.16");
  });

  it.each(["not-a-number", "9".repeat(400)])("treats malformed money text as unavailable (%s)", (value) => {
    const input = report();
    input.Rows.Row[0].Rows.Row[1].ColData[1].value = value;
    input.Rows.Row[0].Summary.ColData[1].value = "18359.16";
    input.Rows.Row[2].Summary.ColData[1].value = "10147.33";

    const result = normalizeProfitAndLossReport(input);

    expect(result.verified).toBe(true);
  });

  it("treats a blank money cell as zero", () => {
    const input = report();
    input.Rows.Row[0].Rows.Row[1].ColData[1].value = "  ";
    input.Rows.Row[0].Summary.ColData[1].value = "18359.16";
    input.Rows.Row[2].Summary.ColData[1].value = "10147.33";

    expect(normalizeProfitAndLossReport(input).verified).toBe(true);
  });

  it("supports array envelopes and a single non-Total money column", () => {
    const input = report();
    input.Columns = [input.Columns.Column[0], { ColTitle: "Amount", ColType: "Money" }];
    input.Rows = input.Rows.Row;

    const result = normalizeProfitAndLossReport(input);

    expect(result.verified).toBe(true);
    expect(result.periods[0]).toMatchObject({ key: "Amount", title: "Amount", isTotal: false });
    expect(result.sections.Income.Amount).toBe("19959.16");
  });

  it("creates a stable fallback key for an unnamed money column", () => {
    const input = report();
    input.Columns.Column[1] = { ColType: "Money" };

    const result = normalizeProfitAndLossReport(input);

    expect(result.verified).toBe(true);
    expect(result.periods[0]).toMatchObject({ key: "column-1", title: "column-1" });
  });

  it("fails closed for an invalid report envelope", () => {
    const result = normalizeProfitAndLossReport(null);

    expect(result.verified).toBe(false);
    expect(result).toMatchObject({
      currency: null,
      startPeriod: null,
      endPeriod: null,
      accountingMethod: null,
      periods: [],
      sections: {},
    });
    expect(result.errors).toContain("Response is not a ProfitAndLoss report.");
    expect(result.errors).toContain("Report contains no money columns.");
    expect(result.errors).toContain("No report reconciliation checks could be performed.");
  });

  it("fails closed when multiple money columns have no Total marker", () => {
    const input = report(true);
    input.Columns.Column[3] = { ColTitle: "Mar 2026", ColType: "Money" };

    const result = normalizeProfitAndLossReport(input);

    expect(result.verified).toBe(false);
    expect(result.errors).toContain("Report has multiple money columns but no unambiguous Total column.");
  });

  it("fails net-income reconciliation when the reported result is wrong", () => {
    const input = report();
    input.Rows.Row[2].Summary.ColData[1].value = "1.00";

    const result = normalizeProfitAndLossReport(input);

    expect(result.verified).toBe(false);
    expect(result.errors).toContain("Calculated Net Income 11747.33 does not equal reported 1.00.");
  });

  it("accounts for COGS and other income and expenses", () => {
    const input = report();
    input.Rows.Row.splice(
      1,
      0,
      {
        Rows: { Row: [{ ColData: [{ value: "Materials" }, { value: "100.00" }], type: "Data" }] },
        Summary: { ColData: [{ value: "Total COGS" }, { value: "100.00" }] },
        type: "Section",
        group: "COGS",
      },
    );
    input.Rows.Row.splice(
      3,
      0,
      {
        Rows: { Row: [{ ColData: [{ value: "Interest" }, { value: "50.00" }], type: "Data" }] },
        Summary: { ColData: [{ value: "Other Income" }, { value: "50.00" }] },
        type: "Section",
        group: "OtherIncome",
      },
      {
        Rows: { Row: [{ ColData: [{ value: "Other fee" }, { value: "25.00" }], type: "Data" }] },
        Summary: { ColData: [{ value: "Other Expenses" }, { value: "25.00" }] },
        type: "Section",
        group: "OtherExpenses",
      },
    );
    input.Rows.Row[input.Rows.Row.length - 1].Summary.ColData[1].value = "11672.33";

    const result = normalizeProfitAndLossReport(input);

    expect(result.verified).toBe(true);
    expect(result.sections).toMatchObject({
      COGS: { total: "100.00" },
      OtherIncome: { total: "50.00" },
      OtherExpenses: { total: "25.00" },
    });
  });

  it("skips unavailable detail and period checks but remains fail closed", () => {
    const input = report(true);
    input.Rows.Row[1].Rows = { Row: [] };
    input.Rows.Row[1].Summary.ColData[2] = {};

    const result = normalizeProfitAndLossReport(input);

    expect(result.verified).toBe(false);
    expect(result.checks.some((check) => check.name === "Expenses period reconciliation")).toBe(false);
    expect(result.errors).toContain("Expenses summary is 8211.83, but no detail is available to reconcile it.");
  });

  it("accepts an empty zero-valued expense section", () => {
    const input = report();
    input.Rows.Row[1].Rows = { Row: [] };
    input.Rows.Row[1].Summary.ColData[1].value = "0.00";
    input.Rows.Row[2].Summary.ColData[1].value = "19959.16";

    expect(normalizeProfitAndLossReport(input).verified).toBe(true);
  });

  it("fails closed when a required summary cell is missing", () => {
    const input = report();
    input.Rows.Row[1].Summary.ColData[1] = {};

    const result = normalizeProfitAndLossReport(input);

    expect(result.verified).toBe(false);
    expect(result.errors).toContain("Expenses has no numeric summary for Total.");
  });

  it.each(["Income", "Expenses", "NetIncome"])("does not run the net-income equation without a numeric %s summary", (group) => {
    const input = report();
    const row = input.Rows.Row.find((item: any) => item.group === group);
    row.Summary.ColData[1] = {};

    const result = normalizeProfitAndLossReport(input);

    expect(result.checks.some((check) => check.name === "Net income reconciliation")).toBe(false);
    expect(result.verified).toBe(false);
  });
});

