import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const ROOT_DIR = import.meta.dirname
  ? path.resolve(import.meta.dirname, "..")
  : process.cwd();

/**
 * The lab provides `openrouter.env` in the repository root using shell syntax
 * (`export KEY=value`). We deliberately support that format as well as a plain
 * `.env`, and never override variables that are already set in the process.
 */
function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(
      /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/,
    );
    if (!match) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }

    if (!(match[1] in process.env)) {
      process.env[match[1]] = value;
    }
  }
}

const envCandidates = [
  process.env.ENV_FILE,
  path.join(ROOT_DIR, ".env"),
  path.join(ROOT_DIR, "..", "openrouter.env"),
  path.join(ROOT_DIR, "..", ".env"),
].filter((file): file is string => Boolean(file));

for (const file of envCandidates) {
  loadEnvFile(path.resolve(file));
}

export const ASSETS_DIR = path.join(ROOT_DIR, "assets");
export const CACHE_DIR = process.env.WEATHER_CACHE_DIR
  ? path.resolve(process.env.WEATHER_CACHE_DIR)
  : path.join(ROOT_DIR, ".cache");
export const SCENES_DIR = path.join(CACHE_DIR, "scenes");

export const PORT = Number(process.env.PORT ?? 3000);

export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
export const PROMPT_MODEL =
  process.env.PROMPT_MODEL ?? "google/gemini-2.5-flash";
export const IMAGE_MODEL =
  process.env.IMAGE_MODEL ?? "qwen/qwen-image-2.1-turbo";

export const WEATHER_USER_AGENT =
  process.env.WEATHER_USER_AGENT ??
  "cs2010-weather-scene/1.0 (Plymouth State University class project; student@plymouth.edu)";

export const POINT = {
  name: "Plymouth, NH",
  lat: 43.7589,
  lon: -71.6892,
  timeZone: "America/New_York",
} as const;

export const REFERENCE_FILE = path.join(ASSETS_DIR, "reference.jpg");
export const REFERENCE_META_FILE = path.join(ASSETS_DIR, "reference.json");

export function apiKeyConfigured(): boolean {
  return OPENROUTER_API_KEY.trim().length > 0;
}
