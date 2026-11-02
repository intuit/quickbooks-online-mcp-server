import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const modulePath = fileURLToPath(import.meta.url);

export type CommandRunResult = Pick<
  SpawnSyncReturns<Buffer>,
  "error" | "status"
>;

export type CommandRunner = (
  command: string,
  args: string[],
  cwd: string,
) => CommandRunResult;

export const defaultCommandRunner: CommandRunner = (command, args, cwd) =>
  spawnSync(command, args, { cwd, stdio: "inherit" });

export const runCommand = (
  command: string,
  args: string[],
  cwd: string,
  runner: CommandRunner,
): void => {
  const result = runner(command, args, cwd);
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
};

export type BuildBundleOptions = {
  root?: string;
  platform?: NodeJS.Platform;
  runCommand?: CommandRunner;
};

export const buildBundle = (options: BuildBundleOptions = {}): string => {
  const root = options.root ?? process.cwd();
  const platform = options.platform ?? process.platform;
  const runner = options.runCommand ?? defaultCommandRunner;
  const stagingDir = join(root, ".mcpb-build");
  const packageJson = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  ) as { version: string; devDependencies?: Record<string, string> };
  const outputPath = join(
    root,
    `quickbooks-online-mcp-server-${packageJson.version}.mcpb`,
  );

  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });

  for (const file of [
    "manifest.json",
    "package.json",
    "package-lock.json",
    "LICENSE",
  ]) {
    cpSync(join(root, file), join(stagingDir, file));
  }
  cpSync(join(root, "dist"), join(stagingDir, "dist"), { recursive: true });

  const stagedPackageJson = { ...packageJson, scripts: {} };
  writeFileSync(
    join(stagingDir, "package.json"),
    `${JSON.stringify(stagedPackageJson, null, 2)}\n`,
  );
  runCommand(
    "npm",
    ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"],
    stagingDir,
    runner,
  );

  const runtimePackageJson = { ...stagedPackageJson };
  delete runtimePackageJson.devDependencies;
  writeFileSync(
    join(stagingDir, "package.json"),
    `${JSON.stringify(runtimePackageJson, null, 2)}\n`,
  );

  const mcpbBinary = resolve(
    root,
    "node_modules",
    ".bin",
    platform === "win32" ? "mcpb.cmd" : "mcpb",
  );
  runCommand(mcpbBinary, ["validate", join(stagingDir, "manifest.json")], root, runner);
  runCommand(mcpbBinary, ["pack", stagingDir, outputPath], root, runner);
  rmSync(stagingDir, { recursive: true, force: true });

  return outputPath;
};

export const isMainModule = (argv: string[] = process.argv): boolean => {
  const entry = argv[1];
  if (!entry) {
    return false;
  }
  return fileURLToPath(import.meta.url) === resolve(entry);
};

export const main = (): void => {
  const outputPath = buildBundle();
  console.log(`Created ${outputPath}`);
};

export const runCliIfMain = (argv: string[] = process.argv): void => {
  if (isMainModule(argv)) {
    main();
  }
};

runCliIfMain();
