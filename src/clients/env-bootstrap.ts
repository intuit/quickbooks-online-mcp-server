import dotenv from "dotenv";
import fs from "fs";
import os from "os";
import path from "path";

export type QBCreds = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  realmId: string;
  environment: string;
  redirectUri: string;
  envFilePath: string;
};

const REQUIRED_VARS = [
  "QUICKBOOKS_CLIENT_ID",
  "QUICKBOOKS_CLIENT_SECRET",
  "QUICKBOOKS_REFRESH_TOKEN",
  "QUICKBOOKS_REALM_ID",
] as const;

function candidateEnvPaths(): string[] {
  const fromEnv = process.env.QUICKBOOKS_ENV_FILE;
  const home = os.homedir() || process.env.HOME || "";
  const homeCandidates = home
    ? [
        path.join(home, "mcp-servers/quickbooks/.env"),
        path.join(home, ".quickbooks/.env"),
      ]
    : [];
  return [
    fromEnv,
    ...homeCandidates,
    path.join(process.cwd(), ".env"),
  ].filter((p): p is string => !!p);
}

function firstExisting(paths: string[]): string | null {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function bootstrapQuickBooksEnv(): QBCreds {
  const candidates = candidateEnvPaths();
  const envFilePath = firstExisting(candidates);

  if (envFilePath) {
    dotenv.config({ path: envFilePath, override: false });
  } else {
    dotenv.config();
  }

  const missing = REQUIRED_VARS.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    const where = envFilePath ?? "(no .env file found)";
    const details = [
      "QuickBooks MCP startup validation failed.",
      `Loaded env file: ${where}`,
      `Missing required vars: ${missing.join(", ")}`,
      `Search paths: ${candidates.join(" | ")}`,
      "Set QUICKBOOKS_ENV_FILE to your single source-of-truth .env (recommended: ~/mcp-servers/quickbooks/.env).",
    ].join("\n");
    throw new Error(details);
  }

  return {
    clientId: process.env.QUICKBOOKS_CLIENT_ID!,
    clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET!,
    refreshToken: process.env.QUICKBOOKS_REFRESH_TOKEN!,
    realmId: process.env.QUICKBOOKS_REALM_ID!,
    environment: process.env.QUICKBOOKS_ENVIRONMENT || "sandbox",
    redirectUri: process.env.QUICKBOOKS_REDIRECTURI || "http://localhost:8000/callback",
    envFilePath: envFilePath || candidates[0] || path.join(process.cwd(), ".env"),
  };
}
