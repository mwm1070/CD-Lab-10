import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  IMAGE_MODEL,
  OPENROUTER_API_KEY,
  PROMPT_MODEL,
  REFERENCE_FILE,
  REFERENCE_META_FILE,
  SCENES_DIR,
  apiKeyConfigured,
} from "./config";
import type {
  PromptSource,
  ReferenceMeta,
  Scene,
  Weather,
} from "../shared/types";

const MIN_CHANGE = 2.5;
const LATEST_FILE = path.join(SCENES_DIR, "latest.json");

type Reference = {
  buffer: Buffer;
  dataUrl: string;
  meta: ReferenceMeta;
};

let referenceCache: Reference | null = null;

export async function getReference(): Promise<Reference> {
  if (referenceCache) return referenceCache;

  if (!existsSync(REFERENCE_FILE)) {
    throw new Error(
      "Reference image is missing. Run `npm run fetch:reference` to download it.",
    );
  }

  const original = await readFile(REFERENCE_FILE);
  const buffer = await sharp(original)
    .rotate()
    .resize({ width: 1100, withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  let meta: ReferenceMeta;
  try {
    meta = JSON.parse(
      await readFile(REFERENCE_META_FILE, "utf8"),
    ) as ReferenceMeta;
  } catch {
    meta = {
      title: "Rounds Hall, Plymouth State University",
      artist: "User:Magicipiano",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:PlymouthNH_PlymouthStateU_RoundsHall.jpg",
      downloadUrl:
        "https://upload.wikimedia.org/wikipedia/commons/4/42/PlymouthNH_PlymouthStateU_RoundsHall.jpg",
      downloadedAt: new Date(0).toISOString(),
    };
  }

  referenceCache = {
    buffer,
    dataUrl: `data:image/jpeg;base64,${buffer.toString("base64")}`,
    meta,
  };
  return referenceCache;
}

export function referenceReady(): boolean {
  return existsSync(REFERENCE_FILE);
}

function temperatureWords(tempF: number): string {
  if (tempF <= 20) return "bitterly cold";
  if (tempF <= 32) return "freezing";
  if (tempF <= 45) return "cold";
  if (tempF <= 60) return "chilly";
  if (tempF <= 75) return "mild";
  return "hot";
}

function timeOfDayDetails(weather: Weather): string {
  switch (weather.timeOfDay.key) {
    case "night":
      return "It is night: deep blue-black sky, visible stars, warm light glowing from the building's windows, and street lamps casting pools of light.";
    case "pre-dawn":
      return "It is pre-dawn: a deep blue sky, a faint glow along the horizon, lit windows, and cool blue shadows.";
    case "dawn":
      return "It is early morning: soft pink and orange dawn light, long shadows, and a little mist in the valley.";
    case "morning":
      return "It is morning: clear, crisp light with long but bright shadows.";
    case "midday":
      return "It is midday: bright, high sunlight and short, crisp shadows.";
    case "afternoon":
      return "It is afternoon: warm, open light across the facade and lawn.";
    case "golden-hour":
      return "It is golden hour: low, warm sunlight raking across the building, long shadows, and glowing highlights.";
    case "dusk":
      return "It is dusk: a purple-blue sky, warm lit windows, and streetlights just coming on.";
    case "evening":
      return "It is evening: a dark sky, warm lit windows, and visible streetlights.";
    default:
      return "";
  }
}

function seasonDetails(weather: Weather): string {
  switch (weather.season.key) {
    case "winter":
      return "Bare branches, snow on the roof and ground, cold blue shadows, and a low winter sun.";
    case "late-winter":
      return "Dirty, melting snowbanks, patchy snow, bare branches, and brown grass.";
    case "early-spring":
      return "Mud season: patchy snow, wet ground, bare branches, and the first tiny green buds.";
    case "spring":
      return "Fresh green grass, trees just leafing out, and a few early flowers.";
    case "late-spring":
      return "Lush fresh green leaves, deep green grass, and lilacs in bloom.";
    case "early-summer":
      return "Full green tree canopy, bright green lawn, and long daylight.";
    case "summer":
      return "Dense green leaves, deep green grass, and a hazy summer sky.";
    case "late-summer":
      return "Deep green foliage with the first touches of gold, and dry patches in the grass.";
    case "early-autumn":
      return "The first red and orange maples, fallen leaves, and crisp air.";
    case "autumn":
      return "Peak fall foliage: vivid red, orange, and gold maples, fallen leaves across the lawn, and brown grass.";
    case "late-autumn":
      return "Stick season: bare gray-brown branches, brown grass, wet fallen leaves, and a cold, low sky.";
    case "early-winter":
      return "Bare trees, a dusting of snow, cold gray light, and holiday-season atmosphere.";
    default:
      return "";
  }
}

function forecastDetails(weather: Weather): string {
  const text =
    `${weather.current.shortForecast} ${weather.current.windSpeed} ${weather.current.windDirection}`.toLowerCase();
  const details: string[] = [];

  if (text.includes("snow") || text.includes("flurr")) {
    details.push(
      "Falling snow, snow accumulation on the roof and ground, and soft, diffuse light.",
    );
  }
  if (text.includes("rain") || text.includes("shower") || text.includes("drizzle")) {
    details.push(
      "Wet pavement with puddles, rain-darkened brick, low clouds, and visible rain streaks.",
    );
  }
  if (text.includes("fog") || text.includes("mist")) {
    details.push("Thick fog muting the distance and softening every edge.");
  }
  if (text.includes("thunder") || text.includes("storm")) {
    details.push("Dark, dramatic storm clouds and moody, shifting light.");
  }
  if (text.includes("cloud") || text.includes("overcast")) {
    details.push("An overcast sky with soft, shadowless light.");
  }
  if (text.includes("sun") || text.includes("clear") || text.includes("fair")) {
    details.push("A clear sky with crisp, defined shadows.");
  }
  if (text.includes("wind") || text.includes("breez") || text.includes("gust")) {
    details.push("A breezy feel, with leaves or snow moving in the air.");
  }

  if (details.length === 0) {
    details.push(
      `Conditions that clearly read as ${weather.current.shortForecast}.`,
    );
  }

  return `${details.join(" ")} ${temperatureWords(weather.current.temperatureF)} air at ${weather.current.temperatureF}°F.`;
}

export function buildFallbackPrompt(weather: Weather): string {
  return [
    `Re-imagine the reference photograph of Rounds Hall at Plymouth State University to match ${weather.season.label} in Plymouth, New Hampshire on ${weather.localDate} at ${weather.localTime}.`,
    `${weather.timeOfDay.label}: ${weather.current.shortForecast}, ${weather.current.temperatureF}°F, wind ${weather.current.windSpeed} ${weather.current.windDirection}.`,
    timeOfDayDetails(weather),
    seasonDetails(weather),
    forecastDetails(weather),
    "Keep the building, its architecture, the camera angle, and the overall composition unchanged.",
    "Change the sky, lighting, foliage, ground cover, and atmosphere so the seasonal and weather shift is obvious and photorealistic.",
    "Do not add text, people, animals, or new buildings.",
  ]
    .filter(Boolean)
    .join(" ");
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: unknown }).text ?? "");
        }
        return "";
      })
      .join(" ");
  }
  return "";
}

function cleanPrompt(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^```(?:text|markdown)?\s*/i, "").replace(/```\s*$/i, "");
  text = text.replace(/^(?:image\s+)?prompt\s*:\s*/i, "");
  text = text.replace(/^["'`]+|["'`]+$/g, "");
  text = text.replace(/\s+/g, " ").trim();
  if (text.length > 650) {
    text = `${text.slice(0, 650).replace(/\s+\S*$/, "")}…`;
  }
  return text;
}

function ensurePreservation(prompt: string): string {
  if (/compositions?|camera angle|unchanged|keep the building/i.test(prompt)) {
    return prompt;
  }
  return `${prompt} Keep the building, camera angle, and composition unchanged.`;
}

async function writePromptWithLlm(
  weather: Weather,
  referenceDataUrl: string,
): Promise<{ prompt: string; source: PromptSource; model: string }> {
  const fallback = buildFallbackPrompt(weather);

  if (!apiKeyConfigured()) {
    return { prompt: fallback, source: "fallback", model: PROMPT_MODEL };
  }

  const instruction = [
    "You are an expert photo editor and art director.",
    "The attached image is the reference photograph. It will be edited by a separate image model.",
    "Write exactly ONE image-editing prompt (under 110 words) that changes the reference to match the weather scene below.",
    "The prompt must describe concrete visual changes to sky, light, shadows, foliage, ground, and atmosphere.",
    "It must preserve the building, its architecture, the camera angle, and the composition.",
    "Do not ask for text, people, animals, or extra buildings.",
    "Return only the prompt text, with no preamble, labels, or quotation marks.",
    "",
    "WEATHER SCENE:",
    weather.summary,
  ].join("\n");

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Plymouth Weather Scene",
        },
        body: JSON.stringify({
          model: PROMPT_MODEL,
          messages: [
            {
              role: "system",
              content:
                "You write precise, compact prompts for photorealistic image-to-image editing. You never add commentary.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: instruction },
                {
                  type: "image_url",
                  image_url: { url: referenceDataUrl },
                },
              ],
            },
          ],
          max_tokens: 260,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(45_000),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `prompt model returned ${response.status}: ${body.slice(0, 300)}`,
      );
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const text = cleanPrompt(
      extractText(body.choices?.[0]?.message?.content),
    );

    if (text.length < 20) {
      throw new Error("prompt model returned an empty/short prompt");
    }

    return {
      prompt: ensurePreservation(text),
      source: "llm",
      model: PROMPT_MODEL,
    };
  } catch (error) {
    console.warn(
      `[scene] LLM prompt generation failed; using deterministic fallback. ${String(error)}`,
    );
    return { prompt: fallback, source: "fallback", model: PROMPT_MODEL };
  }
}

async function requestImage(
  prompt: string,
  referenceDataUrl: string,
): Promise<Buffer> {
  const response = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Plymouth Weather Scene",
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      input_references: [
        { type: "image_url", image_url: { url: referenceDataUrl } },
      ],
    }),
    signal: AbortSignal.timeout(150_000),
  });

  const raw = await response.text();
  let body: {
    data?: Array<{
      b64_json?: string;
      url?: string;
      media_type?: string;
      revised_prompt?: string;
    }>;
    error?: { message?: string };
  };

  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    throw new Error(
      `image model returned non-JSON (${response.status}): ${raw.slice(0, 300)}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `image model error ${response.status}: ${body.error?.message ?? raw.slice(0, 300)}`,
    );
  }

  const item = body.data?.[0];
  if (!item) {
    throw new Error("image model returned no image data");
  }

  if (item.b64_json) {
    return Buffer.from(item.b64_json, "base64");
  }

  if (item.url) {
    const imageResponse = await fetch(item.url, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!imageResponse.ok) {
      throw new Error(`could not download generated image: ${imageResponse.status}`);
    }
    return Buffer.from(await imageResponse.arrayBuffer());
  }

  throw new Error("image model response contained neither b64_json nor url");
}

async function fingerprint(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(32, 32, { fit: "cover" })
    .grayscale()
    .raw()
    .toBuffer();
}

async function differenceScore(a: Buffer, b: Buffer): Promise<number> {
  const [left, right] = await Promise.all([fingerprint(a), fingerprint(b)]);
  let total = 0;
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    total += Math.abs(left[i] - right[i]);
  }
  return Math.round((total / length) * 100) / 100;
}

async function generateChangedImage(
  reference: Reference,
  basePrompt: string,
): Promise<{
  image: Buffer;
  difference: number;
  prompt: string;
  attempts: number;
}> {
  let prompt = basePrompt;
  let lastDifference = 0;
  let lastImage: Buffer | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const raw = await requestImage(prompt, reference.dataUrl);

    const metadata = await sharp(raw).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error("image model returned data that is not a valid image");
    }

    // The model returns a large PNG. Downscale and encode as JPEG so the
    // browser is not asked to download an 8 MB hero image.
    const image = await sharp(raw)
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    const difference = await differenceScore(reference.buffer, image);
    lastDifference = difference;
    lastImage = image;

    if (difference >= MIN_CHANGE) {
      return { image, difference, prompt, attempts: attempt };
    }

    // The model barely changed the reference. Ask again with a stronger nudge.
    prompt = `${basePrompt} IMPORTANT: make the seasonal and weather change unmistakable. Repaint the sky, trees, lawn, and lighting so the scene is obviously different from the reference at a glance, while keeping the building and camera angle intact.`;
    console.warn(
      `[scene] attempt ${attempt} only differed by ${difference}; retrying with a stronger prompt`,
    );
  }

  return {
    image: lastImage as Buffer,
    difference: lastDifference,
    prompt,
    attempts: 2,
  };
}

async function writeFileAtomic(file: string, data: Buffer | string): Promise<void> {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

async function saveScene(scene: Scene, image: Buffer): Promise<void> {
  await mkdir(SCENES_DIR, { recursive: true });
  const metaPath = path.join(SCENES_DIR, `${scene.hash}.json`);
  const imagePath = path.join(SCENES_DIR, `${scene.hash}.jpg`);
  await Promise.all([
    writeFileAtomic(imagePath, image),
    writeFileAtomic(metaPath, `${JSON.stringify(scene, null, 2)}\n`),
    writeFileAtomic(LATEST_FILE, `${JSON.stringify(scene, null, 2)}\n`),
  ]);
}

function sceneImageExists(scene: Scene): boolean {
  return existsSync(path.join(SCENES_DIR, `${scene.hash}.jpg`));
}

async function readLatestScene(): Promise<Scene | null> {
  try {
    const scene = JSON.parse(await readFile(LATEST_FILE, "utf8")) as Scene;
    return sceneImageExists(scene) ? scene : null;
  } catch {
    return null;
  }
}

async function findSceneByWeatherKey(weatherKey: string): Promise<Scene | null> {
  try {
    const files = await readdir(SCENES_DIR);
    for (const file of files) {
      if (!file.endsWith(".json") || file === "latest.json") continue;
      try {
        const scene = JSON.parse(
          await readFile(path.join(SCENES_DIR, file), "utf8"),
        ) as Scene;
        if (scene.weatherKey === weatherKey && sceneImageExists(scene)) {
          return scene;
        }
      } catch {
        // Ignore a partially written or unrelated JSON file.
      }
    }
  } catch {
    // No cache directory yet.
  }
  return null;
}

export async function getSceneForWeather(
  weather: Weather,
): Promise<Scene | null> {
  const latest = await readLatestScene();
  if (!latest) return null;

  if (latest.weatherKey === weather.conditionsKey) {
    return { ...latest, stale: false };
  }

  const matching = await findSceneByWeatherKey(weather.conditionsKey);
  if (matching) return { ...matching, stale: false };

  return { ...latest, stale: true };
}

export async function getLatestScene(): Promise<Scene | null> {
  return readLatestScene();
}

const inFlight = new Map<string, Promise<Scene>>();

export async function generateScene(
  weather: Weather,
  force = false,
): Promise<Scene> {
  if (!apiKeyConfigured()) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Add it to weather/.env or the repo-root openrouter.env.",
    );
  }

  if (!force) {
    const existing = await getSceneForWeather(weather);
    if (existing && !existing.stale) return existing;
  }

  const key = force
    ? `${weather.conditionsKey}-${Date.now().toString(36)}`
    : weather.conditionsKey;

  const running = inFlight.get(key);
  if (running) return running;

  const task = (async (): Promise<Scene> => {
    const reference = await getReference();
    const { prompt: llmPrompt, source, model } = await writePromptWithLlm(
      weather,
      reference.dataUrl,
    );

    const result = await generateChangedImage(reference, llmPrompt);

    const hash = createHash("sha256")
      .update(
        [
          weather.conditionsKey,
          result.prompt,
          reference.buffer.length,
          Date.now().toString(36),
        ].join("|"),
      )
      .digest("hex")
      .slice(0, 20);

    const scene: Scene = {
      hash,
      imageUrl: `/api/scene/${hash}.jpg`,
      prompt: result.prompt,
      promptSource: source,
      promptModel: model,
      imageModel: IMAGE_MODEL,
      generatedAt: new Date().toISOString(),
      weatherKey: weather.conditionsKey,
      changed: result.difference >= MIN_CHANGE,
      difference: result.difference,
      attempts: result.attempts,
    };

    await saveScene(scene, result.image);
    return scene;
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, task);
  return task;
}

export function readSceneImage(hash: string): Promise<Buffer> {
  const safe = path.basename(hash).replace(/[^a-zA-Z0-9._-]/g, "");
  return readFile(path.join(SCENES_DIR, `${safe}.jpg`));
}

export function minChangeThreshold(): number {
  return MIN_CHANGE;
}
