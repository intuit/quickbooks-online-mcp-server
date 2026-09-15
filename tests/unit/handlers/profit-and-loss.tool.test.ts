import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  mockQuickbooksClient,
  mockQuickbooksClientClass,
  mockQuickBooksInstance,
  resetAllMocks,
} from "../../mocks/quickbooks.mock";

jest.unstable_mockModule("../../../src/clients/quickbooks-client", () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { GetProfitAndLossTool } = await import("../../../src/tools/get-profit-and-loss.tool");

describe("GetProfitAndLossTool", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it("places a verified normalized summary before the raw report", async () => {
    const report = {
      Header: { ReportName: "ProfitAndLoss", Currency: "USD" },
      Columns: {
        Column: [
          { ColTitle: "", ColType: "Account" },
          { ColTitle: "Total", ColType: "Money", MetaData: [{ Name: "ColKey", Value: "total" }] },
        ],
      },
      Rows: {
        Row: [
          {
            Rows: { Row: [{ ColData: [{ value: "Sales" }, { value: "100.00" }], type: "Data" }] },
            Summary: { ColData: [{ value: "Total Income" }, { value: "100.00" }] },
            type: "Section",
            group: "Income",
          },
          {
            Rows: { Row: [{ ColData: [{ value: "Fees" }, { value: "25.00" }], type: "Data" }] },
            Summary: { ColData: [{ value: "Total Expenses" }, { value: "25.00" }] },
            type: "Section",
            group: "Expenses",
          },
          {
            Summary: { ColData: [{ value: "Net Income" }, { value: "75.00" }] },
            type: "Section",
            group: "NetIncome",
          },
        ],
      },
    };
    mockQuickBooksInstance.reportProfitAndLoss.mockImplementation((_params: any, callback: any) => callback(null, report));

    const result = await GetProfitAndLossTool.handler({ params: {} } as any, {} as any);

    expect(result.content[0]).toEqual({ type: "text", text: "Profit and Loss Report (VERIFIED):" });
    const payload = JSON.parse((result.content[1] as { type: "text"; text: string }).text);
    expect(payload.normalized).toMatchObject({
      verified: true,
      sections: { Income: { total: "100.00" }, Expenses: { total: "25.00" }, NetIncome: { total: "75.00" } },
    });
    expect(payload.rawReport).toEqual(report);
  });

  it("preserves the existing serialized handler error", async () => {
    mockQuickBooksInstance.reportProfitAndLoss.mockImplementation((_params: any, callback: any) =>
      callback(new Error("Report failed"), null),
    );

    const result = await GetProfitAndLossTool.handler({ params: {} } as any, {} as any);

    expect(result).toEqual({ content: [{ type: "text", text: "Error: Error: Report failed" }] });
  });

  it("labels a non-reconciling report as unverified", async () => {
    const report = { Header: { ReportName: "ProfitAndLoss" }, Columns: { Column: [] }, Rows: { Row: [] } };
    mockQuickBooksInstance.reportProfitAndLoss.mockImplementation((_params: any, callback: any) => callback(null, report));

    const result = await GetProfitAndLossTool.handler({ params: {} } as any, {} as any);

    expect(result.content[0]).toEqual({ type: "text", text: "Profit and Loss Report (UNVERIFIED):" });
    const payload = JSON.parse((result.content[1] as { type: "text"; text: string }).text);
    expect(payload.normalized.verified).toBe(false);
    expect(payload.normalized.errors).toContain("Report contains no money columns.");
  });
});

