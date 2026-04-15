import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

/**
 * Delete (make inactive) an employee in QuickBooks Online
 */
export async function deleteQuickbooksEmployee(idOrEntity: any): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();

    return new Promise((resolve) => {
      // Helper to fetch entity when only ID supplied
      const getEntity = (cb: (employee: any) => void) => {
        if (typeof idOrEntity === "object" && idOrEntity?.Id) {
          cb(idOrEntity);
        } else {
          (quickbooks as any).getEmployee(idOrEntity, (e: any, emp: any) => cb(emp));
        }
      };

      getEntity((employeeEntity) => {
        if (!employeeEntity || !employeeEntity.Id) {
          resolve({
            result: null,
            isError: true,
            error: formatError("Unable to retrieve employee for inactive update"),
          });
          return;
        }

        // Mark employee as inactive
        const inactiveEntity = {
          Id: employeeEntity.Id,
          SyncToken: employeeEntity.SyncToken,
          Active: false,
          sparse: true,
        };

        (quickbooks as any).updateEmployee(inactiveEntity, (err: any, resp: any) => {
          if (err) {
            resolve({ result: null, isError: true, error: formatError(err) });
          } else {
            resolve({ result: resp, isError: false, error: null });
          }
        });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
