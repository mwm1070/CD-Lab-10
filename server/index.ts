import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  CACHE_DIR,
  IMAGE_MODEL,
  PORT,
  PROMPT_MODEL,
  REFERENCE_FILE,
  REFERENCE_META_FILE,
  ROOT_DIR,
  SCENES_DIR,
  apiKeyConfigured,
} from "./config";
import { getWeather } from "./weather";
import {
  generateScene,
  getLatestScene,
  getReference,
  getSceneForWeather,
  minChangeThreshold,
  readSceneImage,
  referenceReady,
} from "./scene";
import type { ApiError, ReferenceMeta, SceneResponse } from "../shared/types";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));

function wrap(
  handler: (request: Request, response: Response) => Promise<void>,
): (request: Request, response: Response, next: NextFunction) => void {
  return (request, response, next) => {
    handler(request, response).catch(next);
  };
}

function sceneResponse(scene: SceneResponse["scene"]): SceneResponse {
  return {
    scene,
    apiKeyConfigured: apiKeyConfigured(),
    referenceReady: referenceReady(),
  };
}

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    apiKeyConfigured: apiKeyConfigured(),
    referenceReady: referenceReady(),
    promptModel: PROMPT_MODEL,
    imageModel: IMAGE_MODEL,
    minChangeScore: minChangeThreshold(),
    time: new Date().toISOString(),
  });
});

app.get(
  "/api/weather",
  wrap(async (request, response) => {
    const force = request.query.refresh === "1";
    const weather = await getWeather(force);
    response.setHeader("Cache-Control", "no-store");
    response.json(weather);
  }),
);

app.get(
  "/api/reference",
  wrap(async (_request, response) => {
    if (!referenceReady()) {
      response.status(404).json({
        error:
          "Reference image is missing. Run `npm run fetch:reference` to download it.",
      } satisfies ApiError);
      return;
    }
    response.setHeader("Cache-Control", "public, max-age=86400");
    response.sendFile(REFERENCE_FILE);
  }),
);

app.get(
  "/api/reference/meta",
  wrap(async (_request, response) => {
    try {
      const { meta } = await getReference();
      response.setHeader("Cache-Control", "public, max-age=86400");
      response.json(meta satisfies ReferenceMeta);
    } catch (error) {
      response.status(404).json({
        error: error instanceof Error ? error.message : "Reference not found",
      } satisfies ApiError);
    }
  }),
);

app.get(
  "/api/scene",
  wrap(async (_request, response) => {
    let scene = null;
    try {
      const weather = await getWeather();
      scene = await getSceneForWeather(weather);
    } catch (error) {
      console.warn(
        `[api] could not compare scene with current weather: ${String(error)}`,
      );
      scene = await getLatestScene();
    }
    response.setHeader("Cache-Control", "no-store");
    response.json(sceneResponse(scene));
  }),
);

app.post(
  "/api/scene",
  wrap(async (request, response) => {
    const force = request.query.refresh === "1" || request.body?.force === true;
    const weather = await getWeather(force);
    const scene = await generateScene(weather, force);
    response.setHeader("Cache-Control", "no-store");
    response.json(sceneResponse(scene));
  }),
);

app.get(
  "/api/scene/:hash.jpg",
  wrap(async (request, response) => {
    try {
      const image = await readSceneImage(request.params.hash);
      response.setHeader(
        "Cache-Control",
        "public, max-age=31536000, immutable",
      );
      response.type("jpg").send(image);
    } catch {
      response.status(404).json({ error: "Scene not found" } satisfies ApiError);
    }
  }),
);

app.use("/api", (_request, response) => {
  response.status(404).json({ error: "Unknown API endpoint" } satisfies ApiError);
});

async function start(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(SCENES_DIR, { recursive: true });

  if (process.env.NODE_ENV === "production") {
    const dist = path.join(ROOT_DIR, "dist");
    if (!existsSync(path.join(dist, "index.html"))) {
      console.warn(
        "[server] dist/index.html is missing. Run `npm run build` before `npm start`.",
      );
    }
    app.use(express.static(dist));
    app.use((request, response, next) => {
      if (request.method !== "GET" || request.path.startsWith("/api/")) {
        next();
        return;
      }
      response.sendFile(path.join(dist, "index.html"));
    });
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      const message =
        error instanceof Error ? error.message : "Unexpected server error";
      console.error(`[server] ${message}`);
      const isKeyProblem = /OPENROUTER_API_KEY/.test(message);
      const isReferenceProblem = /Reference image is missing/.test(message);
      response.status(isKeyProblem ? 503 : isReferenceProblem ? 503 : 500).json({
        error: message,
        hint: isKeyProblem
          ? "Create weather/.env with OPENROUTER_API_KEY=sk-or-..., or keep the repo-root openrouter.env."
          : isReferenceProblem
            ? "Run `npm run fetch:reference` in weather/."
            : undefined,
      } satisfies ApiError);
    },
  );

  app.listen(PORT, () => {
    console.log(`\n  Plymouth Weather Scene`);
    console.log(`  http://localhost:${PORT}\n`);
    console.log(
      `  OpenRouter key: ${apiKeyConfigured() ? "configured" : "MISSING (image generation disabled)"}`,
    );
    console.log(
      `  Reference image: ${referenceReady() ? path.relative(ROOT_DIR, REFERENCE_FILE) : `MISSING (run: npm run fetch:reference)`}`,
    );
    console.log(`  Prompt model: ${PROMPT_MODEL}`);
    console.log(`  Image model:  ${IMAGE_MODEL}`);
    console.log(`  Cache:        ${path.relative(ROOT_DIR, CACHE_DIR)}`);
    if (!existsSync(REFERENCE_META_FILE)) {
      console.log(
        "  Note: assets/reference.json is missing; attribution will use defaults.",
      );
    }
    console.log("");
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
