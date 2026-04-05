// src/handlers/generic-handler.ts
import { quickbooksClient } from "../clients/quickbooks-client.js";
import { ENTITIES } from "../catalog/entity-config.js";
import { buildQuickbooksSearchCriteria } from "../helpers/build-quickbooks-search-criteria.js";

/**
 * Call a node-quickbooks method, promisifying the callback API.
 */
function callQB(methodName: string, ...args: any[]): Promise<any> {
  const qb = quickbooksClient.getQuickbooks();
  return new Promise((resolve, reject) => {
    (qb as any)[methodName](...args, (err: any, result: any) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

/**
 * Creates a new record in QuickBooks.
 * @param entity The entity type (e.g. 'customer', 'invoice')
 * @param data The record data to create
 * @returns The created record
 * @throws Error if the entity type does not support creation
 */
export async function executeCreate(entity: string, data: any): Promise<any> {
  const config = ENTITIES[entity];
  if (!config?.methods.create) {
    throw new Error(`Create is not supported for ${entity}. Use search_actions to find available operations.`);
  }
  await quickbooksClient.authenticate();
  return callQB(config.methods.create, data);
}

/**
 * Retrieves a record by ID from QuickBooks.
 * @param entity The entity type (e.g. 'customer', 'invoice')
 * @param id The record ID to retrieve
 * @returns The record with the given ID
 * @throws Error if the entity type does not support get by ID
 */
export async function executeGet(entity: string, id: string): Promise<any> {
  const config = ENTITIES[entity];
  if (!config?.methods.get) {
    throw new Error(`Get by ID is not supported for ${entity}. Use search_actions to find available operations.`);
  }
  await quickbooksClient.authenticate();
  return callQB(config.methods.get, id);
}

/**
 * Updates a record in QuickBooks.
 * @param entity The entity type (e.g. 'customer', 'invoice')
 * @param data The record data to update (must include Id and SyncToken)
 * @returns The updated record
 * @throws Error if the entity type does not support update
 */
export async function executeUpdate(entity: string, data: any): Promise<any> {
  const config = ENTITIES[entity];
  if (!config?.methods.update) {
    throw new Error(`Update is not supported for ${entity}. Use search_actions to find available operations.`);
  }
  await quickbooksClient.authenticate();
  return callQB(config.methods.update, data);
}

/**
 * Deletes a record from QuickBooks. For soft-delete entities, sets Active=false.
 * @param entity The entity type (e.g. 'customer', 'invoice')
 * @param idOrEntity The record ID or full record object to delete
 * @returns The deleted/deactivated record
 * @throws Error if the entity type does not support deletion
 */
export async function executeDelete(entity: string, idOrEntity: any): Promise<any> {
  const config = ENTITIES[entity];
  if (!config?.methods.delete) {
    throw new Error(`Delete is not supported for ${entity}. Use search_actions to find available operations.`);
  }
  await quickbooksClient.authenticate();

  // Soft-delete entities get set to Active=false
  if (config.softDelete) {
    const id = typeof idOrEntity === "object" ? idOrEntity.Id : idOrEntity;
    const current = await callQB(config.methods.get!, id);
    return callQB(config.methods.update!, {
      Id: current.Id,
      SyncToken: current.SyncToken,
      Active: false,
    });
  }

  return callQB(config.methods.delete, idOrEntity);
}

/**
 * Executes a QuickBooks financial report.
 * @param methodName The report method name (e.g. 'getProfitAndLossReport')
 * @param options Report options, typically containing start_date and end_date
 * @returns The report data
 */
export async function executeReport(methodName: string, options: any): Promise<any> {
  await quickbooksClient.authenticate();
  return callQB(methodName, options ?? {});
}

/**
 * Searches for records in QuickBooks matching the given criteria.
 * @param entity The entity type (e.g. 'customer', 'invoice')
 * @param criteria Search criteria (simple object, array, or AdvancedQuickbooksSearchOptions)
 * @returns Array of records matching the criteria
 * @throws Error if the entity type does not support search
 */
export async function executeSearch(entity: string, criteria: any): Promise<any[]> {
  const config = ENTITIES[entity];
  if (!config?.methods.find) {
    throw new Error(`Search is not supported for ${entity}. Use search_actions to find available operations.`);
  }
  await quickbooksClient.authenticate();
  const normalized = buildQuickbooksSearchCriteria(criteria ?? {});
  const result = await callQB(config.methods.find, normalized);
  return result?.QueryResponse?.[config.queryResponseKey] ?? [];
}
