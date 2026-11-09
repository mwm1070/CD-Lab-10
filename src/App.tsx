import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchReferenceMeta,
  fetchScene,
  fetchWeather,
  generateScene,
} from "./api";
import type {
  ReferenceMeta,
  Scene,
  Weather,
  WeatherPeriod,
} from "../shared/types";

const TIME_ZONE = "America/New_York";

function fmtTime(iso: string, timeZone = TIME_ZONE): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function fmtDateTime(iso: string, timeZone = TIME_ZONE): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function fmtDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function PeriodRow({ period }: { period: WeatherPeriod }) {
  const tempLabel = period.isDaytime ? "High" : "Low";
  return (
    <li className="period">
      <div className="period-main">
        <span className="period-name">{period.name}</span>
        <span className="period-cond">{period.shortForecast}</span>
      </div>
      <div className="period-side">
        <span className="period-temp">
          <em>{tempLabel}</em> {period.temperatureF}°
        </span>
        <span className="period-wind">
          {period.windSpeed} {period.windDirection}
          {period.precipChance != null ? ` · ${period.precipChance}%` : ""}
        </span>
      </div>
    </li>
  );
}

function LoadingScreen() {
  return (
    <div className="boot">
      <div className="boot-card">
        <div className="spinner large" aria-hidden="true" />
        <h1>Reading the Plymouth sky</h1>
        <p>Fetching the latest National Weather Service forecast.</p>
      </div>
    </div>
  );
}

export default function App() {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [refMeta, setRefMeta] = useState<ReferenceMeta | null>(null);
  const [apiKeyReady, setApiKeyReady] = useState(true);
  const [referenceReady, setReferenceReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [compare, setCompare] = useState(50);
  const [showPrompt, setShowPrompt] = useState(false);

  const runGeneration = useCallback(async (force: boolean) => {
    setGenerating(true);
    setSceneError(null);
    try {
      const result = await generateScene(force);
      if (result.scene) setScene(result.scene);
      setApiKeyReady(result.apiKeyConfigured);
      setReferenceReady(result.referenceReady);
    } catch (err) {
      setSceneError(
        err instanceof Error ? err.message : "Could not generate the scene.",
      );
    } finally {
      setGenerating(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const nextWeather = await fetchWeather();
        if (cancelled) return;
        setWeather(nextWeather);
        setError(null);

        const sceneResponse = await fetchScene();
        if (cancelled) return;
        setScene(sceneResponse.scene);
        setApiKeyReady(sceneResponse.apiKeyConfigured);
        setReferenceReady(sceneResponse.referenceReady);

        if (
          !sceneResponse.scene &&
          sceneResponse.apiKeyConfigured &&
          sceneResponse.referenceReady
        ) {
          void runGeneration(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load the weather or the scene.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runGeneration]);

  useEffect(() => {
    let alive = true;
    fetchReferenceMeta()
      .then((meta) => {
        if (alive) setRefMeta(meta);
      })
      .catch(() => {
        // Attribution falls back to the built-in values below.
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      fetchWeather()
        .then((next) => {
          setWeather(next);
          setError(null);
        })
        .catch(() => {
          // Keep showing the last good forecast during a transient outage.
        });
    }, 10 * 60 * 1000);

    return () => window.clearInterval(timer);
  }, []);

  const retry = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchWeather(true);
      setWeather(next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load the weather.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshWeather = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const next = await fetchWeather(true);
      setWeather(next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not refresh the weather.",
      );
    } finally {
      setRefreshing(false);
    }
  }, []);

  if (loading && !weather) return <LoadingScreen />;

  if (!weather) {
    return (
      <div className="boot">
        <div className="boot-card">
          <h1>Could not load the weather</h1>
          <p>{error ?? "The National Weather Service did not respond."}</p>
          <button className="btn primary" onClick={retry}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const timeZone = weather.location.timeZone;
  const stale = Boolean(scene && scene.weatherKey !== weather.conditionsKey);
  const heroSrc = scene?.imageUrl ?? (referenceReady ? "/api/reference" : null);
  const changedLabel = scene?.changed ? "Verified change" : "Change unverified";

  return (
    <div className="page">
      <div className="ambient ambient-a" aria-hidden="true" />
      <div className="ambient ambient-b" aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-dot" aria-hidden="true" />
          <span className="brand-name">Plymouth Weather Scene</span>
          <span className="brand-sub">CS 2010 · APIs</span>
        </div>
        <div className="actions">
          <button
            className="btn ghost"
            onClick={refreshWeather}
            disabled={refreshing || generating}
          >
            {refreshing ? "Refreshing…" : "Refresh weather"}
          </button>
          <button
            className="btn primary"
            onClick={() => runGeneration(true)}
            disabled={generating || !apiKeyReady || !referenceReady}
            title={
              !apiKeyReady
                ? "Set OPENROUTER_API_KEY to generate scenes"
                : !referenceReady
                  ? "Run npm run fetch:reference first"
                  : "Generate a new scene for the current weather"
            }
          >
            {generating ? "Generating…" : scene ? "Re-imagine scene" : "Generate scene"}
          </button>
        </div>
      </header>

      <main className="shell">
        {(!apiKeyReady || !referenceReady) && (
          <div className="banner warning">
            {!referenceReady
              ? "Reference photo missing. Run `npm run fetch:reference` in weather/."
              : "OPENROUTER_API_KEY is not set. Live weather still works, but scene generation is off."}
          </div>
        )}

        {error && (
          <div className="banner error">
            <span>{error}</span>
            <button className="link-button" onClick={retry}>
              Retry
            </button>
          </div>
        )}

        {sceneError && (
          <div className="banner error">
            <span>{sceneError}</span>
            <button
              className="link-button"
              onClick={() => void runGeneration(true)}
              disabled={generating}
            >
              Try again
            </button>
          </div>
        )}

        <section className="hero">
          {heroSrc ? (
            <img className="hero-img" src={heroSrc} alt="" />
          ) : (
            <div className="hero-img hero-fallback" />
          )}
          <div className="hero-shade" aria-hidden="true" />

          <div className="hero-topline">
            <span className="eyebrow">
              <span className="live-dot" aria-hidden="true" />
              {weather.location.name} · {weather.season.label} ·{" "}
              {weather.timeOfDay.label}
            </span>
            {scene && (
              <span className={`pill ${stale ? "stale" : ""}`}>
                {stale ? "Scene from earlier conditions" : "Scene matches now"}
              </span>
            )}
          </div>

          <div className="hero-content">
            <h1 className="hero-temp">
              {weather.current.temperatureF}
              <sup>°F</sup>
            </h1>
            <p className="hero-condition">{weather.current.shortForecast}</p>
            <div className="hero-meta">
              <span>{weather.localTime}</span>
              <span>
                Wind {weather.current.windSpeed} {weather.current.windDirection}
              </span>
              <span>{weather.current.precipChance ?? 0}% precip</span>
              <span>
                Sunrise {fmtTime(weather.sun.sunrise, timeZone)} · Sunset{" "}
                {fmtTime(weather.sun.sunset, timeZone)}
              </span>
            </div>
          </div>

          {stale && (
            <div className="hero-banner">
              <span>The forecast changed since this scene was made.</span>
              <button
                className="btn small"
                onClick={() => void runGeneration(false)}
                disabled={generating}
              >
                Update the scene
              </button>
            </div>
          )}

          {generating && (
            <div className="generating-overlay">
              <div className="spinner" aria-hidden="true" />
              <div>
                <strong>Re-imagining Rounds Hall</strong>
                <span>
                  Finding a prompt, then painting the sky, light, and season…
                </span>
              </div>
            </div>
          )}
        </section>

        {scene && referenceReady && (
          <section className="compare-section card">
            <div className="section-head">
              <div>
                <p className="kicker">Image-to-image</p>
                <h2>Same building, different weather</h2>
              </div>
              <div className="compare-badges">
                <span className="badge">{changedLabel}</span>
                <span className="badge subtle">
                  diff {scene.difference.toFixed(1)}
                </span>
                <span className="badge subtle">
                  {scene.attempts} attempt{scene.attempts === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            <div className="compare-frame">
              <img
                className="compare-base"
                src="/api/reference"
                alt="Original reference photograph"
              />
              <div
                className="compare-overlay"
                style={{ clipPath: `inset(0 0 0 ${100 - compare}%)` }}
              >
                <img
                  src={scene.imageUrl}
                  alt="Scene generated for the current weather"
                />
              </div>
              <span
                className="compare-label left"
                style={{ opacity: compare < 92 ? 1 : 0 }}
              >
                Reference
              </span>
              <span
                className="compare-label right"
                style={{ opacity: compare > 8 ? 1 : 0 }}
              >
                Generated
              </span>
            </div>

            <div className="compare-control">
              <span>Reference</span>
              <input
                type="range"
                min={0}
                max={100}
                value={compare}
                onChange={(event) => setCompare(Number(event.target.value))}
                aria-label="Compare the reference photo with the generated scene"
              />
              <span>Generated</span>
            </div>
            <p className="muted small">
              Generated {fmtDateTime(scene.generatedAt, timeZone)} ·{" "}
              {scene.imageModel} ·{" "}
              {scene.promptSource === "llm"
                ? `prompt by ${scene.promptModel}`
                : "deterministic fallback prompt"}
            </p>
          </section>
        )}

        <section className="grid">
          <div className="card">
            <div className="section-head">
              <div>
                <p className="kicker">Right now</p>
                <h2>Current conditions</h2>
              </div>
              <span className="muted small">
                observed {fmtTime(weather.observedAt, timeZone)}
              </span>
            </div>

            <div className="now">
              <div className="now-temp">
                {weather.current.temperatureF}
                <span>°F</span>
              </div>
              <div>
                <p className="now-condition">
                  {weather.current.shortForecast}
                </p>
                <p className="muted">
                  {weather.season.label} — {weather.season.blurb}
                </p>
              </div>
            </div>

            <div className="stats">
              <Stat
                label="Wind"
                value={`${weather.current.windSpeed} ${weather.current.windDirection}`}
              />
              <Stat
                label="Precipitation"
                value={`${weather.current.precipChance ?? 0}%`}
              />
              <Stat
                label="Humidity"
                value={
                  weather.current.humidity == null
                    ? "—"
                    : `${weather.current.humidity}%`
                }
              />
              <Stat
                label="Dew point"
                value={
                  weather.current.dewpointF == null
                    ? "—"
                    : `${weather.current.dewpointF}°F`
                }
              />
              <Stat
                label="Sunrise"
                value={fmtTime(weather.sun.sunrise, timeZone)}
              />
              <Stat
                label="Sunset"
                value={fmtTime(weather.sun.sunset, timeZone)}
              />
              <Stat
                label="Daylight"
                value={fmtDuration(weather.sun.daylightMinutes)}
              />
              <Stat
                label="Conditions key"
                value={weather.conditionsKey.slice(0, 8)}
              />
            </div>
          </div>

          <div className="card">
            <div className="section-head">
              <div>
                <p className="kicker">Next up</p>
                <h2>Forecast</h2>
              </div>
              <span className="muted small">NOAA / NWS</span>
            </div>
            <ul className="periods">
              {weather.periods.map((period) => (
                <PeriodRow key={period.startTime} period={period} />
              ))}
            </ul>
          </div>
        </section>

        <section className="grid">
          <div className="card">
            <div className="section-head">
              <div>
                <p className="kicker">Under the hood</p>
                <h2>How the scene was made</h2>
              </div>
              <button
                className="link-button"
                onClick={() => setShowPrompt((value) => !value)}
              >
                {showPrompt ? "Hide prompt" : "Show prompt"}
              </button>
            </div>

            <ol className="steps">
              <li>
                <strong>Pull the weather.</strong> The Express server calls the
                NWS <code>points</code>, <code>forecast</code>, and{" "}
                <code>forecastHourly</code> endpoints for Plymouth, NH (43.7589,
                -71.6892) and caches the result for five minutes.
              </li>
              <li>
                <strong>Describe the scene.</strong> A multimodal LLM sees the
                reference photo and a briefing with the date, season, time of
                day, and forecast, then writes a single image-editing prompt.
              </li>
              <li>
                <strong>Change the image.</strong> Qwen Image 2.1 Turbo receives
                the reference photo plus that prompt. The server checks that the
                result really differs from the reference before saving it.
              </li>
            </ol>

            {showPrompt && (
              <div className="prompt-box">
                {scene ? (
                  <>
                    <p className="muted small">
                      {scene.promptSource === "llm"
                        ? `Written by ${scene.promptModel}`
                        : "Deterministic fallback (LLM prompt unavailable)"}
                    </p>
                    <p>{scene.prompt}</p>
                  </>
                ) : (
                  <p className="muted">
                    No scene yet. Generate one to see the prompt.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="card">
            <div className="section-head">
              <div>
                <p className="kicker">The raw briefing</p>
                <h2>Weather summary</h2>
              </div>
            </div>
            <pre className="summary">{weather.summary}</pre>
            <p className="muted small">
              The same briefing goes to the prompt-writing model. Time zone:{" "}
              {weather.location.timeZone}.
            </p>
          </div>
        </section>
      </main>

      <footer className="footer">
        <span>
          Reference photo:{" "}
          <a
            href={
              refMeta?.sourceUrl ??
              "https://commons.wikimedia.org/wiki/File:PlymouthNH_PlymouthStateU_RoundsHall.jpg"
            }
            target="_blank"
            rel="noreferrer"
          >
            {refMeta?.title ?? "Rounds Hall, Plymouth State University"}
          </a>{" "}
          by {refMeta?.artist ?? "User:Magicipiano"} ·{" "}
          <a
            href={
              refMeta?.licenseUrl ??
              "https://creativecommons.org/licenses/by-sa/4.0"
            }
            target="_blank"
            rel="noreferrer"
          >
            {refMeta?.license ?? "CC BY-SA 4.0"}
          </a>
        </span>
        <span>
          Weather: NOAA/NWS · Images: Qwen Image 2.1 Turbo via OpenRouter
        </span>
      </footer>
    </div>
  );
}
