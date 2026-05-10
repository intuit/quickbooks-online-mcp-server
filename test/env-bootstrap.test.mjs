import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { bootstrapQuickBooksEnv } from "../dist/clients/env-bootstrap.js";

const QUICKBOOKS_ENV_KEYS = [
  "QUICKBOOKS_CLIENT_ID",
  "QUICKBOOKS_CLIENT_SECRET",
  "QUICKBOOKS_REFRESH_TOKEN",
  "QUICKBOOKS_REALM_ID",
  "QUICKBOOKS_ENVIRONMENT",
  "QUICKBOOKS_REDIRECTURI",
  "QUICKBOOKS_ENV_FILE",
];

function withQuickBooksEnv(updates, callback) {
  const saved = new Map(QUICKBOOKS_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of QUICKBOOKS_ENV_KEYS) {
    delete process.env[key];
  }
  Object.assign(process.env, updates);

  try {
    callback();
  } finally {
    for (const key of QUICKBOOKS_ENV_KEYS) {
      const value = saved.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("defaults QuickBooks bootstrap to sandbox and a creatable env file path", () => {
  const envFilePath = path.join(
    os.tmpdir(),
    `quickbooks-env-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ".env",
  );
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(envFilePath, "");

  withQuickBooksEnv({
    QUICKBOOKS_CLIENT_ID: "client-id",
    QUICKBOOKS_CLIENT_SECRET: "client-secret",
    QUICKBOOKS_REFRESH_TOKEN: "refresh-token",
    QUICKBOOKS_REALM_ID: "realm-id",
    QUICKBOOKS_ENV_FILE: envFilePath,
  }, () => {
    const result = bootstrapQuickBooksEnv();

    assert.equal(result.environment, "sandbox");
    assert.equal(result.redirectUri, "http://localhost:8000/callback");
    assert.equal(result.envFilePath, envFilePath);
  });
});
