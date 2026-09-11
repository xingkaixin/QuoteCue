import { describe, it } from "node:test";
import { RuleTester } from "oxlint/plugins-dev";

import { noKnownValueWideningRule } from "../rules/no-known-value-widening.ts";
import { requireReadableSpacingRule } from "../rules/require-readable-spacing.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });

tester.run("anti-slop/no-known-value-widening", noKnownValueWideningRule, {
  valid: [
    'function available<T>(value: T): { status: "available"; value: T } { return { status: "available", value }; }',
    'const session: { request: (() => boolean) | null } = { request: null }; session.request = () => true;',
    'const session: Readonly<{ request: (() => boolean) | null }> = { request: null };',
    'const entry = { id: "a" } satisfies { id: string };',
    'type Entry = { id: string }; const entry: Entry = { id: "a" };',
    'const entries: Record<string, number> = {};',
  ],
  invalid: [
    { code: 'const entry: unknown = { id: "a" };', errors: [{ messageId: "widening" }] },
    { code: 'const entry: object = { id: "a" };', errors: [{ messageId: "widening" }] },
    { code: 'const entries: Record<string, number> = { a: 1 };', errors: [{ messageId: "widening" }] },
    { code: 'const entries: { [key: string]: number } = { a: 1 };', errors: [{ messageId: "widening" }] },
    { code: 'function entry(): unknown { return { id: "a" }; }', errors: [{ messageId: "widening" }] },
    { code: 'const entry = { id: "a" } as unknown;', errors: [{ messageId: "widening" }] },
  ],
});

tester.run("anti-slop/require-readable-spacing", requireReadableSpacingRule, {
  valid: [
    'const LEGACY_VERSION = 1;\nconst CURRENT_VERSION = 2;',
    'export const LEGACY_VERSION = 1;\nexport const CURRENT_VERSION = 2;',
    'const legacy = 1;\n\nconst current = 2;',
    'function read(value: string): string;\nfunction read(value: number): number;\nfunction read(value: string | number) { return value; }',
    'import { a } from "a";\nimport { b } from "b";\n\nconst total = a + b;',
  ],
  invalid: [
    {
      code: 'function read() {\nconst value = 1;\nreturn value;\n}',
      output: 'function read() {\nconst value = 1;\n\nreturn value;\n}',
      errors: [{ messageId: "expectedBlankLine" }],
    },
    {
      code: 'export const version = 1;\n/** The stored draft. */\nexport type Draft = string;',
      output: 'export const version = 1;\n\n/** The stored draft. */\nexport type Draft = string;',
      errors: [{ messageId: "expectedBlankLine" }],
    },
    {
      code: 'const entry = {\n  id: "a",\n};\nconst version = 1;',
      output: 'const entry = {\n  id: "a",\n};\n\nconst version = 1;',
      errors: [{ messageId: "expectedBlankLine" }],
    },
  ],
});
