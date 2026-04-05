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

export async function executeCreate(entity: string, data: any): Promise<any> {
  const config = ENTITIES[entity];
  if (!config?.methods.create) {
    throw new Error(`Create is not supported for ${entity}. Use search_actions to find available operations.`);
  }
  await quickbooksClient.authenticate();
  return callQB(config.methods.create, data);
}

export async function executeGet(entity: string, id: string): Promise<any> {
  const config = ENTITIES[entity];
  if (!config?.methods.get) {
    throw new Error(`Get by ID is not supported for ${entity}. Use search_actions to find available operations.`);
  }
  await quickbooksClient.authenticate();
  return callQB(config.methods.get, id);
}

export async function executeUpdate(entity: string, data: any): Promise<any> {
  const config = ENTITIES[entity];
  if (!config?.methods.update) {
    throw new Error(`Update is not supported for ${entity}. Use search_actions to find available operations.`);
  }
  await quickbooksClient.authenticate();
  return callQB(config.methods.update, data);
}

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
