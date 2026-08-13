import { loadConfig } from "./config.js";
import { configureDownloadLinks } from "./download-links.js";
import { createHttpServer } from "./http-server.js";
import { log } from "./logger.js";
import { configurePdfHandleStore } from "./pdf-handles.js";
import { configureTransportPolicy, installQboTransportPolicy } from "./qbo-transport.js";
import { ALLOWLISTED_TOOLS } from "./tool-allowlist.js";

/** Time allowed for in-flight requests to finish before the process is forced down. */
const SHUTDOWN_GRACE_MS = 10_000;

function main(): void {
  const config = loadConfig();

  // Both stores default to bounded settings, so this only narrows them to what the
  // deployment asked for; a forgotten call cannot produce an unbounded store.
  configurePdfHandleStore(config.pdf);
  configureDownloadLinks(config.publicBaseUrl);
  configureTransportPolicy(config.transport);
  // Install eagerly so the limits are in force before the first request, not merely
  // before the first QuickBooks call.
  installQboTransportPolicy(config.requestTimeoutMs);

  const server = createHttpServer(config);

  server.listen(config.port, () => {
    log.info("service_started", {
      port: config.port,
      environment: config.environment,
      version: config.version,
      tools: ALLOWLISTED_TOOLS.length,
      publicLinks: config.publicBaseUrl !== undefined,
    });
  });

  const shutdown = (signal: string): void => {
    log.info("shutdown_started", { signal });
    const forced = setTimeout(() => {
      log.warn("shutdown_forced", { afterMs: SHUTDOWN_GRACE_MS });
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    forced.unref();

    server.close((error) => {
      if (error) {
        log.error("shutdown_failed", { message: error.message });
        process.exit(1);
      }
      log.info("shutdown_complete");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // A lost tenant scope or a vendored handler throwing asynchronously must be
  // visible, not silent. The process stays up; the request already failed.
  process.on("unhandledRejection", (reason) => {
    log.error("unhandled_rejection", { message: reason instanceof Error ? reason.message : String(reason) });
  });
}

main();
