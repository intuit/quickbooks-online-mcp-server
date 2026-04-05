// src/config.ts
import dotenv from "dotenv";
dotenv.config();

const WRITE_OPERATIONS = new Set(["create", "update", "delete"]);

/**
 * Indicates whether the server is running in read-only mode.
 * When true, only search, get, and report operations are available.
 * Controlled via the `QUICKBOOKS_READ_ONLY` environment variable.
 */
export const isReadOnly = process.env.QUICKBOOKS_READ_ONLY === "true";

/**
 * Determines whether an operation is a write operation (create, update, or delete).
 * @param operation - The operation type to check.
 * @returns True if the operation modifies data, false for read operations.
 */
export function isWriteOperation(operation: string): boolean {
  return WRITE_OPERATIONS.has(operation);
}
