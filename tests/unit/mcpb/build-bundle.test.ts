import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  buildBundle,
  defaultCommandRunner,
  isMainModule,
  main,
  modulePath,
  runCliIfMain,
  runCommand,
  type CommandRunner,
} from "../../../src/mcpb/build-bundle.js";

describe("runCommand", () => {
  it("throws spawn errors", () => {
    const runner: CommandRunner = () => ({
      error: new Error("spawn failed"),
      status: null,
    });
    expect(() => runCommand("npm", [], "/tmp", runner)).toThrow("spawn failed");
  });

  it("throws non-zero exit statuses", () => {
    const runner: CommandRunner = () => ({ status: 2 });
    expect(() => runCommand("npm", [], "/tmp", runner)).toThrow(
      "exited with status 2",
    );
  });
});

describe("buildBundle", () => {
  let fixtureRoot: string;
  const calls: Array<{ command: string; args: string[]; cwd: string }> = [];

  const recordingRunner: CommandRunner = (command, args, cwd) => {
    calls.push({ command, args, cwd });
    return { status: 0 };
  };

  beforeEach(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), "qbo-build-bundle-"));
    calls.length = 0;
    mkdirSync(join(fixtureRoot, "dist"), { recursive: true });
    writeFileSync(join(fixtureRoot, "dist/index.js"), "export {};\n");
    writeFileSync(
      join(fixtureRoot, "package.json"),
      JSON.stringify({
        name: "fixture",
        version: "0.0.0-test",
        devDependencies: { jest: "1.0.0" },
      }),
    );
    writeFileSync(
      join(fixtureRoot, "manifest.json"),
      JSON.stringify({ name: "fixture", manifest_version: "0.4" }),
    );
    writeFileSync(join(fixtureRoot, "package-lock.json"), "{}\n");
    writeFileSync(join(fixtureRoot, "LICENSE"), "Apache-2.0\n");
    mkdirSync(join(fixtureRoot, "node_modules", ".bin"), { recursive: true });
    writeFileSync(join(fixtureRoot, "node_modules", ".bin", "mcpb"), "");
  });

  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("stages files and invokes validate and pack", () => {
    const output = buildBundle({
      root: fixtureRoot,
      runCommand: recordingRunner,
    });
    expect(output).toBe(
      join(fixtureRoot, "quickbooks-online-mcp-server-0.0.0-test.mcpb"),
    );
    expect(calls.map((c) => c.command)).toEqual([
      "npm",
      join(fixtureRoot, "node_modules", ".bin", "mcpb"),
      join(fixtureRoot, "node_modules", ".bin", "mcpb"),
    ]);
    expect(calls[0]?.args).toContain("--omit=dev");
  });

  it("selects mcpb.cmd on win32", () => {
    buildBundle({
      root: fixtureRoot,
      platform: "win32",
      runCommand: recordingRunner,
    });
    expect(calls[1]?.command).toContain("mcpb.cmd");
  });

  it("fails when dist is missing", () => {
    rmSync(join(fixtureRoot, "dist"), { recursive: true, force: true });
    expect(() =>
      buildBundle({ root: fixtureRoot, runCommand: recordingRunner }),
    ).toThrow();
  });

  it("defaultCommandRunner returns spawnSync shape", () => {
    const result = defaultCommandRunner("node", ["--version"], fixtureRoot);
    expect(result.status).toBe(0);
  });
});

describe("build-bundle CLI", () => {
  it("detects main module entry", () => {
    expect(isMainModule(["node", modulePath])).toBe(true);
    expect(isMainModule(["node"])).toBe(false);
    expect(typeof isMainModule()).toBe("boolean");
  });

  it("runCliIfMain invokes main when argv matches module path", () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    runCliIfMain(["node", modulePath]);
    expect(log.mock.calls.length).toBeGreaterThan(0);
    log.mockRestore();
  });

  it("main logs the created bundle path", () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    main();
    expect(log.mock.calls.some((call) => String(call[0]).includes(".mcpb"))).toBe(
      true,
    );
    log.mockRestore();
  });

  it("runs from compiled dist entry when dist exists", () => {
    const distEntry = resolve(process.cwd(), "dist/mcpb/build-bundle.js");
    const result = spawnSync(process.execPath, [distEntry], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Created");
  });
});
