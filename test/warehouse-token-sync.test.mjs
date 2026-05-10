import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  persistQuickBooksRefreshTokenToWarehouse,
  resolveWarehouseQuickBooksSyncConfig,
} from "../dist/clients/warehouse-token-sync.js";

test("resolves warehouse sync config from env and QuickBooks warehouse config", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qb-token-sync-"));
  const warehousesDir = path.join(tmpDir, "warehouses");
  fs.mkdirSync(warehousesDir, { recursive: true });
  fs.writeFileSync(
    path.join(warehousesDir, "tcc.json"),
    JSON.stringify({
      id: "tcc",
      connectors: ["quickbooks"],
      schedule: { quickbooks: { enabled: true } },
    }),
  );

  const result = resolveWarehouseQuickBooksSyncConfig({
    env: {
      WAREHOUSE_SYNC_API_URL: "https://example.test/functions/v1/warehouse",
      WAREHOUSE_SYNC_SUPABASE_ANON_KEY: "anon-key",
      WAREHOUSE_DEVICE_TOKEN: "worker-token",
    },
    warehousesDir,
    fallbackEnv: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.config.warehouseId, "tcc");
  assert.equal(result.config.controlPlaneUrl, "https://example.test/functions/v1/warehouse");
  assert.equal(result.config.anonKey, "anon-key");
  assert.equal(result.config.workerToken, "worker-token");
});

test("resolves control-plane credentials from worker fallback env", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qb-token-sync-"));
  const warehousesDir = path.join(tmpDir, "warehouses");
  fs.mkdirSync(warehousesDir, { recursive: true });
  fs.writeFileSync(
    path.join(warehousesDir, "tcc.json"),
    JSON.stringify({
      id: "tcc",
      connectors: ["quickbooks"],
    }),
  );

  const result = resolveWarehouseQuickBooksSyncConfig({
    env: {},
    fallbackEnv: {
      WAREHOUSE_SYNC_API_URL: "https://fallback.test/functions/v1/warehouse",
      WAREHOUSE_SYNC_SUPABASE_ANON_KEY: "fallback-anon",
      WAREHOUSE_DEVICE_TOKEN: "fallback-worker-token",
    },
    warehousesDir,
  });

  assert.equal(result.ok, true);
  assert.equal(result.config.controlPlaneUrl, "https://fallback.test/functions/v1/warehouse");
  assert.equal(result.config.anonKey, "fallback-anon");
  assert.equal(result.config.workerToken, "fallback-worker-token");
  assert.equal(result.config.warehouseId, "tcc");
});

test("persists QuickBooks refresh token to Warehouse control plane", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const result = await persistQuickBooksRefreshTokenToWarehouse("rotated-refresh", {
    env: {
      WAREHOUSE_SYNC_API_URL: "https://example.test/functions/v1/warehouse",
      WAREHOUSE_SYNC_SUPABASE_ANON_KEY: "anon-key",
      WAREHOUSE_DEVICE_TOKEN: "worker-token",
      WAREHOUSE_ID: "tcc",
    },
    fallbackEnv: {},
    fetchImpl,
  });

  assert.equal(result.synced, true);
  assert.equal(result.warehouseId, "tcc");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://example.test/functions/v1/warehouse");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.apikey, "anon-key");
  assert.equal(calls[0].init.headers["x-warehouse-worker-token"], "worker-token");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    action: "quickbooks.refresh_token.persist",
    warehouse_id: "tcc",
    refresh_token: "rotated-refresh",
  });
});

test("reports all supported warehouse id sources when sync config is missing", () => {
  const result = resolveWarehouseQuickBooksSyncConfig({
    env: {
      WAREHOUSE_SYNC_API_URL: "https://example.test/functions/v1/warehouse",
      WAREHOUSE_SYNC_SUPABASE_ANON_KEY: "anon-key",
      WAREHOUSE_DEVICE_TOKEN: "worker-token",
    },
    fallbackEnv: {},
    warehousesDir: path.join(os.tmpdir(), "missing-qb-warehouse-configs"),
  });

  assert.equal(result.ok, false);
  assert.match(
    result.missing.join(", "),
    /WAREHOUSE_QUICKBOOKS_WAREHOUSE_ID, WAREHOUSE_CLOUD_WAREHOUSE_ID, WAREHOUSE_ID/,
  );
});

test("treats Warehouse control-plane HTTP failures as skipped sync", async () => {
  const result = await persistQuickBooksRefreshTokenToWarehouse("rotated-refresh", {
    env: {
      WAREHOUSE_SYNC_API_URL: "https://example.test/functions/v1/warehouse",
      WAREHOUSE_SYNC_SUPABASE_ANON_KEY: "anon-key",
      WAREHOUSE_DEVICE_TOKEN: "worker-token",
      WAREHOUSE_ID: "tcc",
    },
    fallbackEnv: {},
    fetchImpl: async () => new Response("temporarily unavailable", {
      status: 503,
      statusText: "Service Unavailable",
    }),
  });

  assert.equal(result.synced, false);
  assert.match(result.skippedReason, /503 Service Unavailable/);
});

test("treats Warehouse control-plane network failures as skipped sync", async () => {
  const result = await persistQuickBooksRefreshTokenToWarehouse("rotated-refresh", {
    env: {
      WAREHOUSE_SYNC_API_URL: "https://example.test/functions/v1/warehouse",
      WAREHOUSE_SYNC_SUPABASE_ANON_KEY: "anon-key",
      WAREHOUSE_DEVICE_TOKEN: "worker-token",
      WAREHOUSE_ID: "tcc",
    },
    fallbackEnv: {},
    fetchImpl: async () => {
      throw new Error("network is down");
    },
  });

  assert.equal(result.synced, false);
  assert.match(result.skippedReason, /network is down/);
});
