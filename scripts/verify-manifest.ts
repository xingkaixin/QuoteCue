import { readFileSync } from "node:fs";

import { SITE_URL_PATTERNS } from "../features/host/site-urls.ts";

const MANIFEST_PATH = ".output/chrome-mv3/manifest.json";

const EXPECTED_KEYS = [
  "manifest_version",
  "name",
  "description",
  "version",
  "icons",
  "permissions",
  "host_permissions",
  "web_accessible_resources",
  "content_scripts",
];

const EXPECTED_PERMISSIONS = ["storage"];

const EXPECTED_CONTENT_SCRIPT_JS = ["content-scripts/content.js"];

const EXPECTED_RESOURCE_GROUPS = ["content-scripts/content.css (dynamic)", "secure-field.html"];

type WebAccessibleResource = {
  resources: string[];
  matches: string[];
  use_dynamic_url?: boolean;
};

type ContentScript = {
  matches: string[];
  js: string[];
};

type ProductionManifest = Record<string, unknown> & {
  permissions: string[];
  host_permissions: string[];
  content_scripts: ContentScript[];
  web_accessible_resources: WebAccessibleResource[];
};

const failures: string[] = [];

function expectSet(label: string, actual: readonly string[], expected: readonly string[]): void {
  const missing = expected.filter((value) => !actual.includes(value));
  const unexpected = actual.filter((value) => !expected.includes(value));
  if (missing.length === 0 && unexpected.length === 0) {
    return;
  }
  failures.push(
    `${label}\n  missing:    ${missing.join(", ") || "(none)"}\n  unexpected: ${
      unexpected.join(", ") || "(none)"
    }`,
  );
}

// Identifies a resource group by content rather than array order, so that a WXT
// reordering passes while a new resource or a lost dynamic URL fails.
function describeResourceGroup(entry: WebAccessibleResource): string {
  const resources = [...entry.resources].sort().join(" + ");
  return entry.use_dynamic_url ? `${resources} (dynamic)` : resources;
}

function readManifest(): ProductionManifest {
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as ProductionManifest;
  } catch {
    console.error(`Cannot read ${MANIFEST_PATH}. Run \`pnpm build\` first.`);
    process.exit(1);
  }
}

const manifest = readManifest();

expectSet("manifest keys", Object.keys(manifest), EXPECTED_KEYS);
expectSet("permissions", manifest.permissions, EXPECTED_PERMISSIONS);
expectSet("host_permissions", manifest.host_permissions, SITE_URL_PATTERNS);

expectSet(
  "content_scripts js",
  manifest.content_scripts.flatMap((script) => script.js),
  EXPECTED_CONTENT_SCRIPT_JS,
);
for (const script of manifest.content_scripts) {
  expectSet(
    `content_scripts matches for ${script.js.join(", ")}`,
    script.matches,
    SITE_URL_PATTERNS,
  );
}

expectSet(
  "web_accessible_resources",
  manifest.web_accessible_resources.map(describeResourceGroup),
  EXPECTED_RESOURCE_GROUPS,
);
for (const entry of manifest.web_accessible_resources) {
  expectSet(
    `web_accessible_resources matches for ${describeResourceGroup(entry)}`,
    entry.matches,
    SITE_URL_PATTERNS,
  );
}

if (failures.length > 0) {
  console.error(
    `Production manifest does not match the reviewed contract:\n\n${failures.join("\n\n")}`,
  );
  process.exit(1);
}

console.log(`${MANIFEST_PATH} matches the reviewed permission and resource contract.`);
