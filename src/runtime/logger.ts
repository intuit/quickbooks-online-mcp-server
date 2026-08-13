/**
 * Structured JSON logging. One line per event, machine-readable, with no
 * interpolated strings. Nothing that identifies a company or carries a token may
 * be passed in: callers pass fingerprints, not realm ids, and never tokens.
 */
type Level = "info" | "warn" | "error";

type Fields = Record<string, string | number | boolean | undefined>;

function emit(level: Level, event: string, fields: Fields = {}): void {
  const line = JSON.stringify({
    level,
    event,
    service: "quickbooks-mcp",
    at: new Date().toISOString(),
    ...fields,
  });
  // The only sanctioned writes in this service; stdout/stderr are the log sinks.
  if (level === "error") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const log = {
  info: (event: string, fields?: Fields) => emit("info", event, fields),
  warn: (event: string, fields?: Fields) => emit("warn", event, fields),
  error: (event: string, fields?: Fields) => emit("error", event, fields),
};
