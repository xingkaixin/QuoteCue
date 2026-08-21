import { SUPPORTED_SITES } from "../../lib/supported-sites.ts";

export const SITE_URL_PATTERNS = SUPPORTED_SITES.map(({ urlPattern }) => urlPattern);
