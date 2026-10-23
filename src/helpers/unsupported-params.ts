import { z } from "zod";

type ZodDef = { typeName?: string; [key: string]: unknown };

function zodDef(schema: unknown): ZodDef | undefined {
  return (schema as { _def?: ZodDef })?._def;
}

function typeName(schema: unknown): string | undefined {
  return zodDef(schema)?.typeName;
}

function objectShape(schema: unknown): Record<string, z.ZodTypeAny> | null {
  const shape = zodDef(schema)?.shape;
  if (!shape) return null;
  try {
    const resolved =
      typeof shape === "function" ? (shape as () => Record<string, z.ZodTypeAny>)() : shape;
    return resolved as Record<string, z.ZodTypeAny>;
  } catch {
    return null;
  }
}

/** True when the object deliberately forwards extra keys (passthrough or catchall). */
export function isPassthroughObject(schema: z.ZodTypeAny): boolean {
  if (typeName(schema) !== "ZodObject") return false;
  const def = zodDef(schema)!;
  if (def.unknownKeys === "passthrough") return true;
  const catchall = def.catchall as { _def?: ZodDef } | undefined;
  return Boolean(catchall && catchall._def?.typeName !== "ZodNever");
}

function isFreeFormSchema(schema: z.ZodTypeAny): boolean {
  const t = typeName(schema);
  return t === "ZodAny" || t === "ZodUnknown" || t === "ZodRecord";
}

function isUnionSchema(schema: z.ZodTypeAny): boolean {
  const t = typeName(schema);
  return t === "ZodUnion" || t === "ZodDiscriminatedUnion";
}

function unwrapWrappers(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  for (;;) {
    const t = typeName(current);
    if (t === "ZodOptional" || t === "ZodNullable" || t === "ZodDefault") {
      current = zodDef(current)!.innerType as z.ZodTypeAny;
      continue;
    }
    if (t === "ZodEffects") {
      current = zodDef(current)!.schema as z.ZodTypeAny;
      continue;
    }
    break;
  }
  return current;
}

function joinPath(base: string, segment: string): string {
  if (!base) return segment;
  return `${base}.${segment}`;
}

function collapseArrayIndexes(path: string): string {
  return path.replace(/\[\d+\]/g, "[]");
}

/** Location key for a Supported-in hint; null at the top-level params object. */
function supportedHintLocation(path: string): string | null {
  if (!path) return null;
  return collapseArrayIndexes(path);
}

export interface CollectAndStripResult {
  cleaned: unknown;
  extras: string[];
  supportedNested: Map<string, string[]>;
}

/**
 * Rebuilds a schema with `.passthrough()` on every stripping object so nested
 * unknown keys survive MCP validation and can be reported.
 */
export function deepPermissiveSchema<T extends z.ZodTypeAny>(schema: T): T {
  const t = typeName(schema);
  switch (t) {
    case "ZodObject": {
      if (isPassthroughObject(schema)) return schema;
      const shape = objectShape(schema);
      if (!shape) return schema;
      let changed = false;
      const mapped: Record<string, z.ZodTypeAny> = {};
      for (const key of Object.keys(shape)) {
        const next = deepPermissiveSchema(shape[key]!);
        mapped[key] = next;
        if (next !== shape[key]) changed = true;
      }
      const obj = schema as unknown as z.ZodObject<any>;
      if (!changed) return obj.passthrough() as unknown as T;
      return obj.extend(mapped).passthrough() as unknown as T;
    }
    case "ZodArray": {
      const def = zodDef(schema) as unknown as z.ZodArrayDef;
      const element = (schema as unknown as z.ZodArray<z.ZodTypeAny>).element;
      const inner = deepPermissiveSchema(element);
      if (inner === element) return schema;
      return new z.ZodArray({
        ...def,
        type: inner,
      }) as unknown as T;
    }
    case "ZodOptional": {
      const def = zodDef(schema) as unknown as z.ZodOptionalDef;
      const unwrapped = (schema as unknown as z.ZodOptional<z.ZodTypeAny>).unwrap();
      const inner = deepPermissiveSchema(unwrapped);
      if (inner === unwrapped) return schema;
      return new z.ZodOptional({
        ...def,
        innerType: inner,
      }) as unknown as T;
    }
    case "ZodNullable": {
      const def = zodDef(schema) as unknown as z.ZodNullableDef;
      const unwrapped = (schema as unknown as z.ZodNullable<z.ZodTypeAny>).unwrap();
      const inner = deepPermissiveSchema(unwrapped);
      if (inner === unwrapped) return schema;
      return new z.ZodNullable({
        ...def,
        innerType: inner,
      }) as unknown as T;
    }
    case "ZodDefault": {
      const def = zodDef(schema) as unknown as z.ZodDefaultDef;
      const inner = deepPermissiveSchema(def.innerType as z.ZodTypeAny);
      if (inner === def.innerType) return schema;
      return new z.ZodDefault({
        ...def,
        innerType: inner,
      }) as unknown as T;
    }
    case "ZodEffects": {
      const def = zodDef(schema) as unknown as z.ZodEffectsDef;
      const inner = deepPermissiveSchema(def.schema as z.ZodTypeAny);
      if (inner === def.schema) return schema;
      return new z.ZodEffects({
        ...def,
        schema: inner,
      }) as unknown as T;
    }
    default:
      return schema;
  }
}

function collectFromObject(
  schema: z.ZodTypeAny,
  value: Record<string, unknown>,
  path: string,
  extras: string[],
  supportedNested: Map<string, string[]>
): Record<string, unknown> {
  if (isPassthroughObject(schema)) {
    return value;
  }

  const shape = objectShape(schema);
  if (!shape) return value;

  const known = new Set(Object.keys(shape));

  for (const key of Object.keys(value)) {
    if (!known.has(key)) {
      extras.push(joinPath(path, key));
      const hintLoc = supportedHintLocation(path);
      if (hintLoc) {
        supportedNested.set(hintLoc, [...known].sort());
      }
    }
  }

  const cleaned: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    if (!known.has(key)) continue;
    const fieldSchema = shape[key]!;
    cleaned[key] = collectAndStripInner(fieldSchema, value[key], joinPath(path, key), extras, supportedNested)
      .cleaned;
  }
  return cleaned;
}

function collectAndStripInner(
  schema: z.ZodTypeAny,
  value: unknown,
  path: string,
  extras: string[],
  supportedNested: Map<string, string[]>
): CollectAndStripResult {
  if (value === null || value === undefined) {
    return { cleaned: value, extras, supportedNested };
  }

  let current = schema;
  for (;;) {
    const t = typeName(current);
    if (t === "ZodOptional" || t === "ZodNullable" || t === "ZodDefault") {
      current = zodDef(current)!.innerType as z.ZodTypeAny;
      continue;
    }
    if (t === "ZodEffects") {
      current = zodDef(current)!.schema as z.ZodTypeAny;
      continue;
    }
    break;
  }

  if (isFreeFormSchema(current) || isUnionSchema(current)) {
    return { cleaned: value, extras, supportedNested };
  }

  if (isPassthroughObject(current)) {
    return { cleaned: value, extras, supportedNested };
  }

  if (typeName(current) === "ZodArray") {
    if (!Array.isArray(value)) {
      return { cleaned: value, extras, supportedNested };
    }
    const elementSchema = zodDef(current)!.type as z.ZodTypeAny;
    const cleanedArray = value.map((item, index) =>
      collectAndStripInner(
        elementSchema,
        item,
        `${path}[${index}]`,
        extras,
        supportedNested
      ).cleaned
    );
    return { cleaned: cleanedArray, extras, supportedNested };
  }

  if (typeName(current) === "ZodObject") {
    if (typeof value !== "object" || Array.isArray(value)) {
      return { cleaned: value, extras, supportedNested };
    }
    const cleaned = collectFromObject(
      current,
      value as Record<string, unknown>,
      path,
      extras,
      supportedNested
    );
    return { cleaned, extras, supportedNested };
  }

  return { cleaned: value, extras, supportedNested };
}

/** Walk params with the original schema; strip unknown nested keys and collect paths. */
export function collectAndStrip(
  schema: z.ZodTypeAny,
  value: unknown,
  path = ""
): CollectAndStripResult {
  const extras: string[] = [];
  const supportedNested = new Map<string, string[]>();
  const inner = unwrapWrappers(schema);

  if (typeName(inner) !== "ZodObject" || value === null || value === undefined) {
    return { cleaned: value, extras, supportedNested };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { cleaned: value, extras, supportedNested };
  }

  const cleaned = collectFromObject(
    inner,
    value as Record<string, unknown>,
    path,
    extras,
    supportedNested
  );
  return { cleaned, extras, supportedNested };
}

const MAX_NAMED_EXTRAS = 10;

function formatExtrasList(extras: string[]): string {
  if (extras.length <= MAX_NAMED_EXTRAS) {
    return extras.join(", ");
  }
  const named = extras.slice(0, MAX_NAMED_EXTRAS);
  const remaining = extras.length - MAX_NAMED_EXTRAS;
  return `${named.join(", ")}, and ${remaining} more`;
}

/** Human-readable notice naming parameters the tool does not support (top-level keys only). */
export function unsupportedParamsWarning(
  toolName: string,
  known: Set<string> | null,
  params: unknown
): string | null {
  if (!known || !params || typeof params !== "object" || Array.isArray(params)) return null;
  const extras = Object.keys(params as Record<string, unknown>).filter((k) => !known.has(k));
  if (extras.length === 0) return null;
  return (
    `WARNING: ${toolName} does not support ${extras.length === 1 ? "this parameter" : "these parameters"}: ` +
    `${extras.join(", ")}. ${extras.length === 1 ? "It was" : "They were"} IGNORED - the value did not reach ` +
    `QuickBooks. Supported parameters: ${[...known].sort().join(", ")}.`
  );
}

/** Build the full warning text including nested paths and supported nested fields. */
export function nestedUnsupportedWarning(
  toolName: string,
  knownTop: Set<string> | null,
  collected: CollectAndStripResult,
  originalParams: unknown
): string | null {
  if (collected.extras.length === 0) return null;

  const hasNestedSupported = collected.supportedNested.size > 0;
  const hasNestedPaths = collected.extras.some((p) => p.includes(".") || p.includes("["));

  if (!hasNestedSupported && !hasNestedPaths) {
    return unsupportedParamsWarning(toolName, knownTop, originalParams);
  }

  if (!knownTop) return null;

  const extras = collected.extras;
  const paramList = formatExtrasList(extras);
  let message =
    `WARNING: ${toolName} does not support ${extras.length === 1 ? "this parameter" : "these parameters"}: ` +
    `${paramList}. ${extras.length === 1 ? "It was" : "They were"} IGNORED - the value did not reach ` +
    `QuickBooks. Supported parameters: ${[...knownTop].sort().join(", ")}.`;

  const nestedLines = [...collected.supportedNested.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([loc, keys]) => `Supported in ${loc}: ${keys.join(", ")}.`);

  if (nestedLines.length > 0) {
    message += `\n${nestedLines.join("\n")}`;
  }

  return message;
}
