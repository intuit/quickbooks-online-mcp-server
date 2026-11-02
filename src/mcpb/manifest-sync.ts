import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const modulePath = fileURLToPath(import.meta.url);

export type ManifestToolEntry = {
  name: string;
  description: string;
};

export type ParseArgsResult = {
  check: boolean;
  root: string;
};

export const parseArgs = (argv: string[]): ParseArgsResult => {
  const rootIndex = argv.indexOf("--root");
  if (rootIndex !== -1 && !argv[rootIndex + 1]) {
    throw new Error("--root requires a directory");
  }

  return {
    check: argv.includes("--check"),
    root: resolve(rootIndex === -1 ? process.cwd() : argv[rootIndex + 1]),
  };
};

const parseSource = (filePath: string) =>
  ts.createSourceFile(
    filePath,
    readFileSync(filePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

const findRegisteredImports = (indexPath: string) => {
  const source = parseSource(indexPath);
  const imports = new Map<
    string,
    { exportName: string; modulePath: string }
  >();
  const registered: string[] = [];

  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }

    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) {
      continue;
    }

    for (const element of bindings.elements) {
      imports.set(element.name.text, {
        exportName: element.propertyName?.text ?? element.name.text,
        modulePath: statement.moduleSpecifier.text,
      });
    }
  }

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "RegisterTool" &&
      node.arguments.length >= 2 &&
      ts.isIdentifier(node.arguments[1])
    ) {
      registered.push(node.arguments[1].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  return [...new Set(registered)].map((localName) => {
    const imported = imports.get(localName);
    if (!imported || !imported.modulePath.startsWith("./tools/")) {
      throw new Error(
        `Registered tool ${localName} is not imported from ./tools`,
      );
    }

    return { localName, ...imported };
  });
};

export const evalStringExpr = (
  expression: ts.Expression,
  constants: Map<string, string>,
  context: string,
): string => {
  if (ts.isStringLiteralLike(expression)) {
    return expression.text;
  }
  if (ts.isIdentifier(expression) && constants.has(expression.text)) {
    return constants.get(expression.text)!;
  }
  if (
    ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    return (
      evalStringExpr(expression.left, constants, context) +
      evalStringExpr(expression.right, constants, context)
    );
  }
  throw new Error(`${context} must resolve to a string literal`);
};

const stringConstants = (source: ts.SourceFile) => {
  const constants = new Map<string, string>();

  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        continue;
      }
      try {
        constants.set(
          declaration.name.text,
          evalStringExpr(
            declaration.initializer,
            constants,
            `${declaration.name.text} initializer`,
          ),
        );
      } catch {
        // Non-string module-level constants are ignored.
      }
    }
  }

  return constants;
};

const readString = (
  expression: ts.Expression,
  constants: Map<string, string>,
  context: string,
) => evalStringExpr(expression, constants, context);

const extractTool = (filePath: string, exportName: string): ManifestToolEntry => {
  const source = parseSource(filePath);
  const constants = stringConstants(source);

  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    const isExported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (!isExported) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.name.text !== exportName ||
        !declaration.initializer ||
        !ts.isObjectLiteralExpression(declaration.initializer)
      ) {
        continue;
      }

      const properties = new Map<string, ts.Expression>();
      for (const property of declaration.initializer.properties) {
        if (
          ts.isPropertyAssignment(property) &&
          ts.isIdentifier(property.name)
        ) {
          properties.set(property.name.text, property.initializer);
        }
      }

      const name = properties.get("name");
      const description = properties.get("description");
      if (!name || !description) {
        throw new Error(`${exportName} must define name and description`);
      }

      return {
        name: readString(name, constants, `${exportName}.name`),
        description: readString(
          description,
          constants,
          `${exportName}.description`,
        ),
      };
    }
  }

  throw new Error(
    `Could not find exported ToolDefinition ${exportName} in ${filePath}`,
  );
};

export const sourcePathForImport = (indexPath: string, modulePath: string) => {
  const typescriptPath = modulePath.endsWith(".js")
    ? `${modulePath.slice(0, -3)}.ts`
    : `${modulePath}.ts`;
  return resolve(dirname(indexPath), typescriptPath);
};

export const generateTools = (root: string): ManifestToolEntry[] => {
  const indexPath = resolve(root, "src/index.ts");
  const tools = findRegisteredImports(indexPath).map(
    ({ exportName, modulePath }) =>
      extractTool(sourcePathForImport(indexPath, modulePath), exportName),
  );

  const names = new Set<string>();
  for (const tool of tools) {
    if (names.has(tool.name)) {
      throw new Error(`Duplicate registered tool name: ${tool.name}`);
    }
    names.add(tool.name);
  }

  return tools.sort((left, right) => left.name.localeCompare(right.name));
};

/** @returns exit code when in check mode; undefined after a successful sync write. */
export const runManifestSync = (argv: string[]): number | undefined => {
  const { check, root } = parseArgs(argv);
  const manifestPath = resolve(root, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    tools?: ManifestToolEntry[];
  };
  const tools = generateTools(root);

  if (check) {
    if (JSON.stringify(manifest.tools) !== JSON.stringify(tools)) {
      console.error(
        "manifest.json tool metadata is out of date. Run npm run manifest:sync.",
      );
      return 1;
    }
    console.log(`manifest.json contains ${tools.length} current tools.`);
    return undefined;
  }

  manifest.tools = tools;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Updated manifest.json with ${tools.length} tools.`);
  return undefined;
};

export const isMainModule = (argv: string[] = process.argv): boolean => {
  const entry = argv[1];
  if (!entry) {
    return false;
  }
  return fileURLToPath(import.meta.url) === resolve(entry);
};

export const main = (): void => {
  const exitCode = runManifestSync(process.argv.slice(2));
  if (exitCode !== undefined) {
    process.exitCode = exitCode;
  }
};

export const runCliIfMain = (argv: string[] = process.argv): void => {
  if (isMainModule(argv)) {
    main();
  }
};

runCliIfMain();
