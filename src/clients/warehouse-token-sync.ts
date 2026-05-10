import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type Env = Record<string, string | undefined>;

export type WarehouseQuickBooksSyncConfig = {
  controlPlaneUrl: string;
  anonKey: string;
  workerToken: string;
  warehouseId: string;
};

export type WarehouseQuickBooksSyncConfigResult =
  | { ok: true; config: WarehouseQuickBooksSyncConfig }
  | { ok: false; missing: string[] };

export type PersistQuickBooksRefreshTokenResult =
  | { synced: true; warehouseId: string }
  | { synced: false; skippedReason: string };

export type WarehouseTokenSyncOptions = {
  env?: Env;
  fallbackEnv?: Env;
  fetchImpl?: typeof fetch;
  launchAgentsDir?: string;
  timeoutMs?: number;
  warehousesDir?: string;
};

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function valueFrom(env: Env, fallbackEnv: Env, name: string): string | undefined {
  return clean(env[name]) ?? clean(fallbackEnv[name]);
}

function resolveControlPlaneUrl(env: Env, fallbackEnv: Env): string | undefined {
  const explicit = valueFrom(env, fallbackEnv, "WAREHOUSE_SYNC_API_URL");
  if (explicit) return explicit;

  const supabaseUrl = valueFrom(env, fallbackEnv, "WAREHOUSE_SUPABASE_URL");
  if (!supabaseUrl) return undefined;
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/warehouse`;
}

function resolveAnonKey(env: Env, fallbackEnv: Env): string | undefined {
  return (
    valueFrom(env, fallbackEnv, "WAREHOUSE_SYNC_SUPABASE_ANON_KEY")
    ?? valueFrom(env, fallbackEnv, "SUPABASE_ANON_KEY")
  );
}

function resolveWorkerToken(env: Env, fallbackEnv: Env): string | undefined {
  return valueFrom(env, fallbackEnv, "WAREHOUSE_DEVICE_TOKEN");
}

function defaultLaunchAgentsDir(): string {
  return path.join(os.homedir(), "Library", "LaunchAgents");
}

function loadWorkerLaunchAgentEnv(launchAgentsDir = defaultLaunchAgentsDir()): Env {
  if (!fs.existsSync(launchAgentsDir)) return {};

  const plistPaths = fs
    .readdirSync(launchAgentsDir)
    .filter((filename) => /^com\.warehouse-sync\.worker\..+\.plist$/.test(filename))
    .map((filename) => path.join(launchAgentsDir, filename))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);

  for (const plistPath of plistPaths) {
    try {
      const raw = execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", plistPath], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const parsed = JSON.parse(raw) as { EnvironmentVariables?: Env };
      if (parsed.EnvironmentVariables) {
        return parsed.EnvironmentVariables;
      }
    } catch {
      continue;
    }
  }

  return {};
}

function defaultWarehousesDir(): string {
  return path.join(os.homedir(), ".warehouse-sync", "warehouses");
}

function configEnablesQuickBooks(config: unknown): boolean {
  if (!config || typeof config !== "object") return false;
  const record = config as Record<string, unknown>;

  const connectors = record.connectors;
  if (
    Array.isArray(connectors)
    && connectors.some((connector) => String(connector).toLowerCase() === "quickbooks")
  ) {
    return true;
  }

  const schedule = record.schedule;
  if (!schedule || typeof schedule !== "object") return false;
  const quickbooks = (schedule as Record<string, unknown>).quickbooks;
  if (!quickbooks || typeof quickbooks !== "object") return false;
  return (quickbooks as Record<string, unknown>).enabled !== false;
}

function resolveQuickBooksWarehouseIdFromConfigs(warehousesDir = defaultWarehousesDir()): string | undefined {
  if (!fs.existsSync(warehousesDir)) return undefined;

  const ids = fs
    .readdirSync(warehousesDir)
    .filter((filename) => filename.endsWith(".json"))
    .flatMap((filename) => {
      const configPath = path.join(warehousesDir, filename);
      try {
        const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as Record<string, unknown>;
        if (!configEnablesQuickBooks(config)) return [];
        const id = clean(typeof config.id === "string" ? config.id : path.basename(filename, ".json"));
        return id ? [id] : [];
      } catch {
        return [];
      }
    });

  const uniqueIds = Array.from(new Set(ids));
  return uniqueIds.length === 1 ? uniqueIds[0] : undefined;
}

function resolveWarehouseId(env: Env, fallbackEnv: Env, warehousesDir?: string): string | undefined {
  return (
    valueFrom(env, fallbackEnv, "WAREHOUSE_QUICKBOOKS_WAREHOUSE_ID")
    ?? valueFrom(env, fallbackEnv, "WAREHOUSE_CLOUD_WAREHOUSE_ID")
    ?? valueFrom(env, fallbackEnv, "WAREHOUSE_ID")
    ?? resolveQuickBooksWarehouseIdFromConfigs(warehousesDir)
  );
}

export function resolveWarehouseQuickBooksSyncConfig(
  options: WarehouseTokenSyncOptions = {},
): WarehouseQuickBooksSyncConfigResult {
  const env = options.env ?? process.env;
  const fallbackEnv = options.fallbackEnv ?? loadWorkerLaunchAgentEnv(options.launchAgentsDir);

  const config = {
    controlPlaneUrl: resolveControlPlaneUrl(env, fallbackEnv),
    anonKey: resolveAnonKey(env, fallbackEnv),
    workerToken: resolveWorkerToken(env, fallbackEnv),
    warehouseId: resolveWarehouseId(env, fallbackEnv, options.warehousesDir),
  };

  const missing = [
    config.controlPlaneUrl ? undefined : "WAREHOUSE_SYNC_API_URL or WAREHOUSE_SUPABASE_URL",
    config.anonKey ? undefined : "WAREHOUSE_SYNC_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY",
    config.workerToken ? undefined : "WAREHOUSE_DEVICE_TOKEN",
    config.warehouseId
      ? undefined
      : "WAREHOUSE_QUICKBOOKS_WAREHOUSE_ID, WAREHOUSE_CLOUD_WAREHOUSE_ID, WAREHOUSE_ID, or one QuickBooks warehouse config",
  ].filter((name): name is string => Boolean(name));

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  const { controlPlaneUrl, anonKey, workerToken, warehouseId } = config;
  return {
    ok: true,
    config: {
      controlPlaneUrl: controlPlaneUrl as string,
      anonKey: anonKey as string,
      workerToken: workerToken as string,
      warehouseId: warehouseId as string,
    },
  };
}

export async function persistQuickBooksRefreshTokenToWarehouse(
  refreshToken: string,
  options: WarehouseTokenSyncOptions = {},
): Promise<PersistQuickBooksRefreshTokenResult> {
  const token = clean(refreshToken);
  if (!token) {
    throw new Error("QuickBooks refresh token sync requires a non-empty token");
  }

  const resolved = resolveWarehouseQuickBooksSyncConfig(options);
  if (!resolved.ok) {
    return {
      synced: false,
      skippedReason: `missing ${resolved.missing.join(", ")}`,
    };
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    return {
      synced: false,
      skippedReason: "global fetch is unavailable",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);

  try {
    const response = await fetchImpl(resolved.config.controlPlaneUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: resolved.config.anonKey,
        "x-warehouse-worker-token": resolved.config.workerToken,
      },
      body: JSON.stringify({
        action: "quickbooks.refresh_token.persist",
        warehouse_id: resolved.config.warehouseId,
        refresh_token: token,
      }),
      signal: controller.signal,
    });

    const responseText = await response.text().catch(() => "");
    if (!response.ok) {
      return {
        synced: false,
        skippedReason: `Warehouse QuickBooks token sync failed (${response.status} ${response.statusText}): `
        + (responseText || "empty response"),
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      synced: false,
      skippedReason: `Warehouse QuickBooks token sync request failed: ${message}`,
    };
  } finally {
    clearTimeout(timeout);
  }

  return { synced: true, warehouseId: resolved.config.warehouseId };
}
