import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import {
  evalStringExpr,
  generateTools,
  isMainModule,
  main,
  modulePath,
  parseArgs,
  runCliIfMain,
  runManifestSync,
  sourcePathForImport,
} from "../../../src/mcpb/manifest-sync.js";

let fixtureRoot: string;

const writeTool = (
  fileName: string,
  exportName: string,
  name: string,
  description: string,
) => {
  writeFileSync(
    join(fixtureRoot, "src/tools", fileName),
    `const toolName = ${JSON.stringify(name)};\n` +
      `const toolDescription = ${JSON.stringify(description)};\n` +
      `export const ${exportName} = {\n` +
      "  name: toolName, description: toolDescription, schema: {}, handler: async () => ({})\n" +
      "};\n",
  );
};

beforeEach(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "qbo-manifest-sync-"));
  mkdirSync(join(fixtureRoot, "src/tools"), { recursive: true });
  writeFileSync(
    join(fixtureRoot, "src/index.ts"),
    'import { ZebraTool } from "./tools/zebra.tool.js";\n' +
      'import { AlphaTool } from "./tools/alpha.tool.js";\n' +
      "RegisterTool(server, ZebraTool);\n" +
      "RegisterTool(server, AlphaTool);\n",
  );
  writeTool("zebra.tool.ts", "ZebraTool", "zebra", "Last alphabetically.");
  writeTool("alpha.tool.ts", "AlphaTool", "alpha", "First alphabetically.");
  writeFileSync(
    join(fixtureRoot, "manifest.json"),
    '{"name":"fixture","tools":[]}\n',
  );
});

afterEach(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

describe("parseArgs", () => {
  it("uses cwd when --root is omitted", () => {
    expect(parseArgs([]).root).toBe(process.cwd());
  });

  it("throws when --root has no path", () => {
    expect(() => parseArgs(["--root"])).toThrow("--root requires a directory");
  });
});

describe("sourcePathForImport", () => {
  it("maps .js imports to .ts sources", () => {
    expect(sourcePathForImport("/proj/src/index.ts", "./tools/a.tool.js")).toBe(
      resolve("/proj/src/tools/a.tool.ts"),
    );
  });

  it("appends .ts when the import omits .js", () => {
    expect(sourcePathForImport("/proj/src/index.ts", "./tools/a.tool")).toBe(
      resolve("/proj/src/tools/a.tool.ts"),
    );
  });
});

describe("evalStringExpr", () => {
  it("rejects non-string expressions", () => {
    const source = ts.createSourceFile(
      "x.ts",
      "const n = 1;",
      ts.ScriptTarget.Latest,
      true,
    );
    const decl = (source.statements[0] as ts.VariableStatement).declarationList
      .declarations[0];
    expect(() =>
      evalStringExpr(
        decl.initializer!,
        new Map(),
        "test",
      ),
    ).toThrow("must resolve to a string literal");
  });
});

describe("generateTools", () => {
  it("returns registered tools sorted by name", () => {
    expect(generateTools(fixtureRoot)).toEqual([
      { name: "alpha", description: "First alphabetically." },
      { name: "zebra", description: "Last alphabetically." },
    ]);
  });

  it("resolves concatenated descriptions", () => {
    writeFileSync(
      join(fixtureRoot, "src/index.ts"),
      'import { ConcatTool } from "./tools/concat.tool.js";\n' +
        "RegisterTool(server, ConcatTool);\n",
    );
    writeFileSync(
      join(fixtureRoot, "src/tools/concat.tool.ts"),
      'const toolName = "concat";\n' +
        'const toolDescription = "part one. " + "part two.";\n' +
        "export const ConcatTool = {\n" +
        "  name: toolName, description: toolDescription, schema: {}, handler: async () => ({})\n" +
        "};\n",
    );
    expect(generateTools(fixtureRoot)).toEqual([
      { name: "concat", description: "part one. part two." },
    ]);
  });

  it("throws when a registered tool is not imported from ./tools", () => {
    writeFileSync(
      join(fixtureRoot, "src/index.ts"),
      'import { AlphaTool } from "../outside.js";\n' +
        "RegisterTool(server, AlphaTool);\n",
    );
    expect(() => generateTools(fixtureRoot)).toThrow(
      "not imported from ./tools",
    );
  });

  it("throws on duplicate tool names", () => {
    writeFileSync(
      join(fixtureRoot, "src/index.ts"),
      'import { AlphaTool } from "./tools/alpha.tool.js";\n' +
        'import { BetaTool } from "./tools/beta.tool.js";\n' +
        "RegisterTool(server, AlphaTool);\n" +
        "RegisterTool(server, BetaTool);\n",
    );
    writeTool("beta.tool.ts", "BetaTool", "alpha", "Duplicate name.");
    expect(() => generateTools(fixtureRoot)).toThrow("Duplicate registered tool");
  });

  it("throws when the export is missing name or description", () => {
    writeFileSync(
      join(fixtureRoot, "src/index.ts"),
      'import { BadTool } from "./tools/bad.tool.js";\n' +
        "RegisterTool(server, BadTool);\n",
    );
    writeFileSync(
      join(fixtureRoot, "src/tools/bad.tool.ts"),
      "export const BadTool = { name: 'x', schema: {}, handler: async () => ({}) };\n",
    );
    expect(() => generateTools(fixtureRoot)).toThrow(
      "must define name and description",
    );
  });

  it("ignores default imports and non-tool statements in index.ts", () => {
    writeFileSync(
      join(fixtureRoot, "src/index.ts"),
      'import sideEffect from "./tools/side.tool.js";\n' +
        'import type { X } from "./tools/alpha.tool.js";\n' +
        'import { AlphaTool } from "./tools/alpha.tool.js";\n' +
        "void sideEffect;\n" +
        "RegisterTool(server, AlphaTool);\n",
    );
    writeFileSync(
      join(fixtureRoot, "src/tools/side.tool.ts"),
      "export default {};\n",
    );
    expect(generateTools(fixtureRoot)).toEqual([
      { name: "alpha", description: "First alphabetically." },
    ]);
  });

  it("ignores spread properties on tool exports", () => {
    writeFileSync(
      join(fixtureRoot, "src/index.ts"),
      'import { AlphaTool } from "./tools/alpha.tool.js";\n' +
        "RegisterTool(server, AlphaTool);\n",
    );
    writeFileSync(
      join(fixtureRoot, "src/tools/alpha.tool.ts"),
      "const toolName = 'alpha';\n" +
        "const toolDescription = 'Spread tool.';\n" +
        "export const AlphaTool = {\n" +
        "  ...{}, name: toolName, description: toolDescription, schema: {}, handler: async () => ({})\n" +
        "};\n",
    );
    expect(generateTools(fixtureRoot)).toEqual([
      { name: "alpha", description: "Spread tool." },
    ]);
  });

  it("ignores non-string constants and incomplete declarations in tool files", () => {
    writeFileSync(
      join(fixtureRoot, "src/index.ts"),
      'import { AlphaTool } from "./tools/alpha.tool.js";\n' +
        "RegisterTool(server, AlphaTool);\n",
    );
    writeFileSync(
      join(fixtureRoot, "src/tools/alpha.tool.ts"),
      "import { z } from 'zod';\n" +
        "const toolName = 'alpha';\n" +
        "let toolDescription;\n" +
        "const count = 1;\n" +
        "function helper() { return toolName; }\n" +
        "export const AlphaTool = {\n" +
        "  name: toolName, description: 'First alphabetically.', schema: {}, handler: async () => ({})\n" +
        "};\n",
    );
    expect(generateTools(fixtureRoot)).toEqual([
      { name: "alpha", description: "First alphabetically." },
    ]);
  });

  it("throws when the exported tool symbol is missing", () => {
    writeFileSync(
      join(fixtureRoot, "src/index.ts"),
      'import { MissingTool } from "./tools/missing.tool.js";\n' +
        "RegisterTool(server, MissingTool);\n",
    );
    writeFileSync(join(fixtureRoot, "src/tools/missing.tool.ts"), "export const Other = {};\n");
    expect(() => generateTools(fixtureRoot)).toThrow(
      "Could not find exported ToolDefinition",
    );
  });
});

describe("runManifestSync", () => {
  it("writes manifest tools in sync mode", () => {
    expect(runManifestSync(["--root", fixtureRoot])).toBeUndefined();
    const manifest = JSON.parse(
      readFileSync(join(fixtureRoot, "manifest.json"), "utf8"),
    );
    expect(manifest.tools).toHaveLength(2);
  });

  it("passes check mode when manifest matches", () => {
    runManifestSync(["--root", fixtureRoot]);
    expect(runManifestSync(["--check", "--root", fixtureRoot])).toBeUndefined();
  });

  it("returns exit code 1 when check mode detects drift", () => {
    runManifestSync(["--root", fixtureRoot]);
    writeTool("alpha.tool.ts", "AlphaTool", "alpha", "Drifted.");
    expect(runManifestSync(["--check", "--root", fixtureRoot])).toBe(1);
  });
});

describe("isMainModule and main", () => {
  it("detects when this module is the process entry", () => {
    expect(isMainModule(["node", modulePath])).toBe(true);
    expect(isMainModule(["node"])).toBe(false);
    expect(isMainModule(["node", "/other/script.js"])).toBe(false);
    expect(typeof isMainModule()).toBe("boolean");
  });

  it("runCliIfMain invokes main when argv matches module path", () => {
    const argv = process.argv;
    process.argv = ["node", modulePath, "--check", "--root", process.cwd()];
    runCliIfMain(process.argv);
    expect(process.exitCode).toBeUndefined();
    process.argv = argv;
  });

  it("main sets exitCode when check fails", () => {
    runManifestSync(["--root", fixtureRoot]);
    writeTool("alpha.tool.ts", "AlphaTool", "alpha", "Drifted.");
    const argv = process.argv;
    process.argv = ["node", modulePath, "--check", "--root", fixtureRoot];
    main();
    expect(process.exitCode).toBe(1);
    process.argv = argv;
    process.exitCode = undefined;
  });
});

describe("manifest-sync CLI", () => {
  it("runs from compiled dist entry", () => {
    const distEntry = resolve(process.cwd(), "dist/mcpb/manifest-sync.js");
    const result = spawnSync(
      process.execPath,
      [distEntry, "--check", "--root", process.cwd()],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("current tools");
  });
});
