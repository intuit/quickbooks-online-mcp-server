import { AsyncLocalStorage } from "node:async_hooks";

interface AuthContext {
  accessToken: string;
}

export const authStorage = new AsyncLocalStorage<AuthContext>();

export function getCurrentAccessToken(): string {
  const ctx = authStorage.getStore();
  if (!ctx?.accessToken) {
    throw new Error("No access token in current request context");
  }
  return ctx.accessToken;
}
