#!/usr/bin/env node
/**
 * Downloads the base photograph used for the image-to-image weather scene.
 *
 * We deliberately do NOT ship a hand-made or previously generated local image:
 * the whole point of the app is to take a real, downloaded photograph and have
 * the image model visibly re-imagine it for the current weather/season/time.
 *
 * Photo: "PlymouthNH PlymouthStateU RoundsHall.jpg" by User:Magicipiano,
 * Wikimedia Commons, CC BY-SA 4.0.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const assets = path.join(root, "assets");

const downloadUrl =
  "https://upload.wikimedia.org/wikipedia/commons/4/42/PlymouthNH_PlymouthStateU_RoundsHall.jpg";
const sourceUrl =
  "https://commons.wikimedia.org/wiki/File:PlymouthNH_PlymouthStateU_RoundsHall.jpg";

const userAgent =
  "cs2010-weather-scene/1.0 (Plymouth State University class project; student@plymouth.edu)";

async function main() {
  console.log(`Downloading reference photo:\n  ${downloadUrl}`);
  const response = await fetch(downloadUrl, {
    headers: { "User-Agent": userAgent, Accept: "image/*" },
  });

  if (!response.ok) {
    throw new Error(
      `Download failed: ${response.status} ${response.statusText}`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Expected an image, received ${contentType || "unknown"}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 10_000) {
    throw new Error(`Downloaded image looks too small (${bytes.length} bytes)`);
  }

  await mkdir(assets, { recursive: true });
  await writeFile(path.join(assets, "reference.jpg"), bytes);

  const meta = {
    title: "Rounds Hall, Plymouth State University",
    artist: "User:Magicipiano",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    sourceUrl,
    downloadUrl,
    downloadedAt: new Date().toISOString(),
  };

  await writeFile(
    path.join(assets, "reference.json"),
    `${JSON.stringify(meta, null, 2)}\n`,
  );

  console.log(
    `Saved assets/reference.jpg (${(bytes.length / 1024).toFixed(0)} KB) and assets/reference.json`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
