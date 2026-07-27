import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { SITE_REGISTRY } from "@/features/host/site-registry";
import { hostThemeTokens } from "@/features/theme/HostThemeProvider";

const MIN_SUBTLE_DIVIDER_CONTRAST = 1.15;
const contentStyle = readFileSync(resolve("entrypoints/content/style.css"), "utf8");

describe("theme token contrast", () => {
  it("defines every CSS theme role at runtime", () => {
    const runtimeRoles = Object.keys(
      hostThemeTokens(SITE_REGISTRY[0].accentTokens).light,
    ).toSorted();
    const cssRoles = [
      ...new Set([...contentStyle.matchAll(/var\(--qc-([a-z0-9-]+)/g)].map((match) => match[1])),
    ].toSorted();

    expect(runtimeRoles).toEqual(cssRoles);
    expect(contentStyle).not.toMatch(/--qc-[a-z0-9-]+\s*:/);
  });

  for (const site of SITE_REGISTRY) {
    for (const [theme, tokens] of Object.entries(hostThemeTokens(site.accentTokens))) {
      it(`${site.hostname} ${theme} keeps text and controls distinguishable`, () => {
        expect(contrast(tokens.text, tokens.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(tokens.muted, tokens.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(tokens.border, tokens.surface)).toBeGreaterThanOrEqual(3);
        expect(contrast(tokens.divider, tokens.surface)).toBeGreaterThanOrEqual(
          MIN_SUBTLE_DIVIDER_CONTRAST,
        );
        expect(contrast(fallbackColor(tokens.accent), tokens.surface)).toBeGreaterThanOrEqual(3);
        expect(contrast(tokens.danger, tokens.surface)).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(fallbackColor(tokens["accent-foreground"]), fallbackColor(tokens.accent)),
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(
            fallbackColor(tokens["accent-subtle-foreground"]),
            fallbackColor(tokens["accent-subtle"]),
          ),
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

function fallbackColor(value: string) {
  return value.match(/#[\da-f]{6}(?=\))/i)?.[0] ?? value;
}

function contrast(left: string, right: string) {
  const lighter = Math.max(luminance(left), luminance(right));
  const darker = Math.min(luminance(left), luminance(right));
  return (lighter + 0.05) / (darker + 0.05);
}

function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  if (!channels || channels.length !== 3) {
    throw new Error(`Invalid color: ${hex}`);
  }
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
