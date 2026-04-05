// src/config.ts
import dotenv from "dotenv";
dotenv.config();

const WRITE_OPERATIONS = new Set(["create", "update", "delete"]);

export const isReadOnly = process.env.QUICKBOOKS_READ_ONLY === "true";

export function isWriteOperation(operation: string): boolean {
  return WRITE_OPERATIONS.has(operation);
}
