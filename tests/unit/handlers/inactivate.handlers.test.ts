import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { deleteQuickbooksCustomer } = await import('../../../src/handlers/delete-quickbooks-customer.handler');
const { deleteQuickbooksVendor } = await import('../../../src/handlers/delete-quickbooks-vendor.handler');
const { deleteQuickbooksItem } = await import('../../../src/handlers/delete-quickbooks-item.handler');
const { deleteQuickbooksEmployee } = await import('../../../src/handlers/delete-quickbooks-employee.handler');
const { DeleteCustomerTool } = await import('../../../src/tools/delete-customer.tool');
const { DeleteVendorTool } = await import('../../../src/tools/delete-vendor.tool');
const { DeleteItemTool } = await import('../../../src/tools/delete-item.tool');
const { DeleteEmployeeTool } = await import('../../../src/tools/delete-employee.tool');

const cases: Array<{ label: string; Pascal: string; handler: any; tool: any }> = [
  { label: 'customer', Pascal: 'Customer', handler: deleteQuickbooksCustomer, tool: DeleteCustomerTool },
  { label: 'vendor', Pascal: 'Vendor', handler: deleteQuickbooksVendor, tool: DeleteVendorTool },
  { label: 'item', Pascal: 'Item', handler: deleteQuickbooksItem, tool: DeleteItemTool },
  { label: 'employee', Pascal: 'Employee', handler: deleteQuickbooksEmployee, tool: DeleteEmployeeTool },
];

describe.each(cases)('inactivate $label', ({ Pascal, handler, tool, label }) => {
  const q = mockQuickBooksInstance as any;
  beforeEach(() => resetAllMocks());

  it('fetches then sends a sparse Active:false update and never deletes', async () => {
    q[`get${Pascal}`].mockImplementation((_id: any, cb: any) => cb(null, { Id: '5', SyncToken: '7', DisplayName: 'Keep me' }));
    q[`update${Pascal}`].mockImplementation((p: any, cb: any) => cb(null, { ...p, ok: true }));
    const r = await handler('5');
    expect(q[`get${Pascal}`]).toHaveBeenCalledWith('5', expect.any(Function));
    expect(q[`update${Pascal}`].mock.calls[0][0]).toEqual({ Id: '5', SyncToken: '7', Active: false, sparse: true });
    if (q[`delete${Pascal}`]) expect(q[`delete${Pascal}`]).not.toHaveBeenCalled();
    expect(r.isError).toBe(false);
    expect(r.result.ok).toBe(true);
  });

  it('errors when the record is not found and does not update', async () => {
    q[`get${Pascal}`].mockImplementation((_id: any, cb: any) => cb(null, undefined));
    const r = await handler('5');
    expect(r.isError).toBe(true);
    expect(r.error).toContain('not found');
    expect(q[`update${Pascal}`]).not.toHaveBeenCalled();
  });

  it('reports fetch and update failures', async () => {
    q[`get${Pascal}`].mockImplementation((_id: any, cb: any) => cb(new Error('get failed'), null));
    expect((await handler('5')).isError).toBe(true);
    q[`get${Pascal}`].mockImplementation((_id: any, cb: any) => cb(null, { Id: '5', SyncToken: '0' }));
    q[`update${Pascal}`].mockImplementation((_p: any, cb: any) => cb(new Error('update failed'), null));
    const r = await handler('5');
    expect(r.isError).toBe(true);
    expect(r.error).toContain('update failed');
  });

  it('reports authentication errors', async () => {
    (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));
    const r = await handler('5');
    expect(r.isError).toBe(true);
    expect(r.error).toContain('Auth failed');
  });

  it('tool: takes { id } only, rejects the old shape, and reports success and failure', async () => {
    expect(tool.schema.safeParse({ id: '5' }).success).toBe(true);
    expect(tool.schema.safeParse({ id: '' }).success).toBe(false);
    expect(tool.schema.safeParse({ idOrEntity: '5' }).success).toBe(false);

    q[`get${Pascal}`].mockImplementation((_id: any, cb: any) => cb(null, { Id: '5', SyncToken: '1' }));
    q[`update${Pascal}`].mockImplementation((p: any, cb: any) => cb(null, p));
    const ok = await tool.handler({ params: { id: '5' } });
    expect(ok.content[0].text).toContain('marked inactive');
    expect(ok.content[1].text).toContain('"Active":false');

    q[`update${Pascal}`].mockImplementation((_p: any, cb: any) => cb(new Error('nope'), null));
    const bad = await tool.handler({ params: { id: '5' } });
    expect(bad.content[0].text).toContain(`Error marking ${label} inactive`);
  });
});
