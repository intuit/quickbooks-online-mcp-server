#!/usr/bin/env node
//
// Regenerates src/runtime/vendor-tool-registry.generated.ts from the vendored
// tool files.
//
//   node scripts/generate-vendor-tool-registry.mjs
//
// Why generated: there are 141 vendored tools, each exporting one ToolDefinition.
// Hand-writing 141 imports invites a typo that type-checks (both sides are
// ToolDefinition) but registers the wrong handler. Reading the files is exact.
//
// Risk is NOT assigned here. This file only answers "what exists"; the reviewed
// policy in tool-allowlist.ts answers "how dangerous is it", so a regeneration
// can never quietly downgrade a tool's risk.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const vendorToolsDir = join(scriptDir, "..", "src", "vendor", "tools");
const outputPath = join(scriptDir, "..", "src", "runtime", "vendor-tool-registry.generated.ts");

const TOOL_NAME_PATTERN = /const\s+toolName\s*=\s*["'`]([^"'`]+)["'`]/;
const EXPORT_PATTERN = /export\s+const\s+([A-Za-z0-9_]+Tool)\s*:/;

const files = (await readdir(vendorToolsDir)).filter((name) => name.endsWith(".tool.ts")).sort();

const discovered = [];
for (const fileName of files) {
  const source = await readFile(join(vendorToolsDir, fileName), "utf8");

  const toolNameMatch = source.match(TOOL_NAME_PATTERN);
  const exportMatch = source.match(EXPORT_PATTERN);
  if (!toolNameMatch) throw new Error(`${fileName}: no 'const toolName = "..."' found`);
  if (!exportMatch) throw new Error(`${fileName}: no exported '*Tool: ToolDefinition' found`);

  discovered.push({
    fileName,
    moduleSpecifier: `../vendor/tools/${fileName.replace(/\.ts$/, ".js")}`,
    exportSymbol: exportMatch[1],
    toolName: toolNameMatch[1],
  });
}

// A duplicate tool name would mean two handlers competing for one MCP name, with
// the winner decided by array order. Fail instead.
const seenToolNames = new Map();
for (const tool of discovered) {
  if (seenToolNames.has(tool.toolName)) {
    throw new Error(
      `duplicate tool name "${tool.toolName}" in ${tool.fileName} and ${seenToolNames.get(tool.toolName)}`,
    );
  }
  seenToolNames.set(tool.toolName, tool.fileName);
}

const duplicateSymbols = discovered
  .map((tool) => tool.exportSymbol)
  .filter((symbol, index, all) => all.indexOf(symbol) !== index);
if (duplicateSymbols.length > 0) {
  throw new Error(`duplicate export symbols: ${duplicateSymbols.join(", ")}`);
}

const importLines = discovered
  .map((tool) => `import { ${tool.exportSymbol} } from "${tool.moduleSpecifier}";`)
  .join("\n");

const entryLines = discovered
  .map((tool) => `  { name: "${tool.toolName}", definition: ${tool.exportSymbol} as AnyVendoredTool },`)
  .join("\n");

const output = `// GENERATED FILE — DO NOT EDIT BY HAND.
// Regenerate with: node scripts/generate-vendor-tool-registry.mjs
//
// Every tool vendored from intuit/quickbooks-online-mcp-server, as data. This
// file states only what exists. Risk classification and which tools are actually
// exposed are decided in tool-allowlist.ts, so regenerating this file can never
// silently change a tool's risk or expose something new without review.
//
// ${discovered.length} tools.

import type { z } from "zod";
import type { ToolDefinition } from "../vendor/types/tool-definition.js";

${importLines}

/** Each vendored tool is typed against its own schema; one list needs one type. */
export type AnyVendoredTool = ToolDefinition<z.ZodTypeAny>;

export interface VendoredToolEntry {
  /** The MCP tool name, read from the tool file rather than inferred. */
  readonly name: string;
  readonly definition: AnyVendoredTool;
}

export const VENDORED_TOOLS: readonly VendoredToolEntry[] = [
${entryLines}
];
`;

await writeFile(outputPath, output, "utf8");

const byVerb = {};
for (const tool of discovered) {
  const verb = tool.toolName.split("_")[0];
  byVerb[verb] = (byVerb[verb] ?? 0) + 1;
}

console.log(`wrote ${outputPath}`);
console.log(`${discovered.length} vendored tools`);
for (const [verb, count] of Object.entries(byVerb).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${verb.padEnd(8)} ${count}`);
}
