// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- This boundary guard leaves fields unknown until a domain parser checks them.
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
