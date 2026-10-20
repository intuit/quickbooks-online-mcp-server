import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const toolsDir = join(process.cwd(), 'src', 'tools');
const files = readdirSync(toolsDir).filter((f) => f.endsWith('.tool.ts')).sort();

// Tool name and description are read from each tool module's source rather than by
// importing it: importing every tool would drag all handlers into coverage. Every
// tool file declares `const toolName = "..."` and `const toolDescription = "..." + "...";`.
const literal = /"(?:[^"\\]|\\.)*"/g;
function parseTool(src: string): { name: string; description: string } | null {
  const name = src.match(/const toolName = ("(?:[^"\\]|\\.)*");/);
  const desc = src.match(/const toolDescription =\s*((?:"(?:[^"\\]|\\.)*"\s*\+?\s*)+);/);
  if (!name || !desc) return null;
  return {
    name: JSON.parse(name[1]),
    description: (desc[1].match(literal) as string[]).map((l) => JSON.parse(l)).join(''),
  };
}

// The tools src/index.ts actually registers, cross-checked against the list above.
const indexSrc = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf8');
const registeredIdentifiers = [...indexSrc.matchAll(/^\s*RegisterTool\(server,\s*(\w+)\)/gm)].map((m) => m[1]);
const importPaths = new Map<string, string>();
for (const m of indexSrc.matchAll(/^import \{ (\w+) \} from "\.\/tools\/([\w-]+)\.tool\.js";/gm)) importPaths.set(m[1], m[2]);
const registeredFiles = registeredIdentifiers.map((id) => importPaths.get(id)).filter(Boolean) as string[];

// Every tool file src/index.ts registers MUST parse; an unparsable one fails the guard
// (naming the file) instead of being skipped.
const unparsable: string[] = [];
const tools: Array<{ name: string; description: string }> = [];
for (const f of registeredFiles) {
  const parsed = parseTool(readFileSync(join(toolsDir, `${f}.tool.ts`), 'utf8'));
  if (parsed) tools.push(parsed);
  else unparsable.push(`${f}.tool.ts`);
}

// Verbs of the 142 tools registered today. A tool with any other verb (void_, send_,
// upsert_ ...) must be classified deliberately, not slip past the write checks.
const KNOWN_VERBS = ['create', 'update', 'delete', 'get', 'search', 'read'];
const verbOf = (n: string) => n.split(/[_-]/)[0];

const isWrite = (n: string) => /^(create|update|delete)[_-]/.test(n);
const writeTools = tools.filter((t) => isWrite(t.name));
const lc = (t: { description: string }) => t.description.toLowerCase();

const VOIDS = ['delete_invoice', 'delete_payment', 'delete_sales_receipt', 'delete_bill_payment', 'delete_refund_receipt'];
const INACTIVATES = ['delete_customer', 'delete-vendor', 'delete_item', 'delete_employee'];

describe('write tool descriptions', () => {
  it('parses every registered tool and knows every verb', () => {
    expect(registeredFiles.length).toBe(registeredIdentifiers.length);
    expect(unparsable).toEqual([]);
    expect(tools.length).toBe(registeredFiles.length);
    const unknown = tools.filter((t) => !KNOWN_VERBS.includes(verbOf(t.name))).map((t) => t.name);
    expect(unknown).toEqual([]);
  });

  it('covers every registered tool', () => {
    expect(registeredFiles.length).toBeGreaterThan(100);
    const loaded = new Set(files.map((f) => f.replace(/\.tool\.ts$/, '')));
    for (const f of registeredFiles) expect(loaded.has(f)).toBe(true);
    expect(writeTools.length).toBeGreaterThan(60);
    // Every registered write tool was parsed (none skipped by the source reader).
    const names = new Set(tools.map((t) => t.name));
    expect(names.size).toBe(tools.length);
    for (const f of registeredFiles.filter((r) => /^(create|update|delete)-/.test(r))) {
      expect(tools.some((t) => t.name.replace(/_/g, '-') === f)).toBe(true);
    }
  });

  it('never claims inactivation or voiding unless the tool does it', () => {
    for (const t of writeTools) {
      const d = lc(t);
      const inactivates = INACTIVATES.includes(t.name);
      const voids = VOIDS.includes(t.name);
      if (d.includes('make inactive')) throw new Error(`${t.name}: stale "make inactive" wording`);
      if (d.includes('(void)') && !voids) throw new Error(`${t.name}: claims "(void)" but does not void`);
      if (d.includes('inactive') && !inactivates) throw new Error(`${t.name}: mentions inactive but does not inactivate`);
    }
  });

  it('every delete tool says exactly one of voids / permanently deletes / marks the', () => {
    const deletes = writeTools.filter((t) => /^delete[_-]/.test(t.name));
    expect(deletes.length).toBe(20);
    for (const t of deletes) {
      const hits = ['voids', 'permanently deletes', 'marks the'].filter((p) => lc(t).includes(p));
      if (hits.length !== 1) throw new Error(`${t.name}: expected exactly one of the phrases, found [${hits.join(', ')}]`);
      const starts = ['voids the', 'permanently deletes the', 'marks the'].some((p) => lc(t).startsWith(p));
      if (!starts) throw new Error(`${t.name}: description must start with its action phrase`);
    }
    for (const n of VOIDS) expect(lc(tools.find((t) => t.name === n)!)).toContain('voids');
    for (const n of INACTIVATES) {
      expect(tools.find((t) => t.name === n)!.description).toMatch(/^Marks the \w+ inactive \(can be undone in QuickBooks\)\.$/);
    }
    const permanent = deletes.filter((t) => !VOIDS.includes(t.name) && !INACTIVATES.includes(t.name));
    expect(permanent.length).toBe(11);
    for (const t of permanent) expect(lc(t)).toContain('permanently deletes');
  });

  it('every create tool starts with "Creates"', () => {
    const creates = writeTools.filter((t) => /^create[_-]/.test(t.name));
    expect(creates.length).toBeGreaterThan(20);
    for (const t of creates) {
      if (!t.description.startsWith('Creates ')) throw new Error(`${t.name}: description must start with "Creates"`);
    }
  });

  it('every update tool says it keeps fields that are not sent', () => {
    const updates = writeTools.filter((t) => /^update[_-]/.test(t.name));
    expect(updates.length).toBeGreaterThan(20);
    for (const t of updates) {
      const d = lc(t);
      const ok = d.includes('changes only the fields you send') ||
        (['update_account', 'update-bill'].includes(t.name) && /fields you omit are (kept|preserved)|you omit are preserved/.test(d));
      if (!ok) throw new Error(`${t.name}: description does not state that unsent fields are kept`);
    }
  });

  it('only tools that take Line arrays say a Line array replaces all lines', () => {
    const noLines = ['update_customer', 'update-vendor', 'update_employee'];
    for (const n of noLines) {
      const t = tools.find((x) => x.name === n)!;
      expect(t.description).not.toContain('Line');
      expect(lc(t)).toContain('changes only the fields you send');
    }
    for (const n of ['update_purchase', 'update_bill_payment', 'update_journal_entry', 'update_invoice', 'update_estimate']) {
      expect(tools.find((x) => x.name === n)!.description).toContain('A `Line` array replaces all lines.');
    }
  });
});

describe('patch-based update descriptions', () => {
  it('warn that nested objects replace the whole object', () => {
    const names = ['update_customer', 'update-vendor', 'update_employee', 'update_purchase', 'update_bill_payment',
      'update_journal_entry', 'update_invoice', 'update_estimate', 'update_item', 'update_account', 'update-bill', 'update_company_info'];
    for (const n of names) {
      const t = tools.find((x) => x.name === n);
      if (!t) throw new Error(`${n}: tool not found`);
      if (!t.description.includes('Nested objects (e.g. BillAddr, ShipAddr, PrimaryEmailAddr) replace the whole object — send all of its sub-fields.')) {
        throw new Error(`${n}: missing nested-object warning`);
      }
    }
  });

  it('pins the void-column and permanent-delete tool sets', () => {
    expect([...VOIDS].sort()).toEqual(['delete_bill_payment', 'delete_invoice', 'delete_payment', 'delete_refund_receipt', 'delete_sales_receipt'].sort());
    expect([...INACTIVATES].sort()).toEqual(['delete_customer', 'delete_employee', 'delete_item', 'delete-vendor'].sort());
    const deletes = writeTools.filter((t) => /^delete[_-]/.test(t.name)).map((t) => t.name);
    const permanent = deletes.filter((n) => !VOIDS.includes(n) && !INACTIVATES.includes(n)).sort();
    expect(permanent).toHaveLength(11);
    for (const n of permanent) expect(lc(tools.find((t) => t.name === n)!)).toContain('permanently deletes');
  });
});
