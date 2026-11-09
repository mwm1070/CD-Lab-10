import { createHash } from "node:crypto";
import { getTimes } from "suncalc";
import { POINT, WEATHER_USER_AGENT } from "./config";
import type {
  SeasonKey,
  TimeOfDayKey,
  Weather,
  WeatherCurrent,
  WeatherPeriod,
} from "../shared/types";

type NwsPointsResponse = {
  properties: {
    gridId: string;
    gridX: number;
    gridY: number;
    forecast: string;
    forecastHourly: string;
    relativeLocation: {
      properties: { city: string; state: string };
    };
  };
};

type NwsPeriod = {
  number: number;
  name: string;
  startTime: string;
  endTime: string;
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: "F" | "C";
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  detailedForecast: string;
  probabilityOfPrecipitation?: { value: number | null };
  relativeHumidity?: { value: number | null };
  dewpoint?: { value: number | null; unitCode: string };
};

type NwsForecastResponse = {
  properties: { periods: NwsPeriod[] };
};

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { at: number; data: Weather } | null = null;

async function getJson<T>(url: string, timeoutMs = 15_000): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": WEATHER_USER_AGENT,
      Accept: "application/geo+json, application/json",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(
      `NWS request failed (${response.status} ${response.statusText}) for ${url}`,
    );
  }

  return (await response.json()) as T;
}

async function getJsonWithRetry<T>(url: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await getJson<T>(url);
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }
  }
  throw lastError;
}

function toFahrenheit(value: number, unit: string): number {
  return unit.toUpperCase() === "C" ? (value * 9) / 5 + 32 : value;
}

function round(value: number): number {
  return Math.round(value);
}

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
};

function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "long",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "0";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    weekday: get("weekday"),
  };
}

function formatLocalDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatLocalTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function formatClock(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function seasonFor(month: number, day: number): {
  key: SeasonKey;
  label: string;
  blurb: string;
} {
  switch (month) {
    case 1:
      return {
        key: "winter",
        label: "Deep winter",
        blurb:
          "short days, deep snowpack, and temperatures that rarely climb above freezing",
      };
    case 2:
      return {
        key: "winter",
        label: "Late winter",
        blurb:
          "deep snow, bright blue-sky days, and the first hints of sugaring season",
      };
    case 3:
      return day < 20
        ? {
            key: "late-winter",
            label: "Late winter",
            blurb:
              "melting snowbanks, icy trails, and a landscape still mostly white and brown",
          }
        : {
            key: "early-spring",
            label: "Early spring",
            blurb:
              "mud season, rushing brooks, bare branches, and the first green shoots",
          };
    case 4:
      return {
        key: "spring",
        label: "Spring",
        blurb:
          "mud season giving way to green grass, daffodils, and trees just beginning to leaf out",
      };
    case 5:
      return {
        key: "late-spring",
        label: "Late spring",
        blurb:
          "lilacs in bloom, fresh green leaves, and black flies in the air",
      };
    case 6:
      return {
        key: "early-summer",
        label: "Early summer",
        blurb:
          "long days, lush green hills, cool mornings, and the first warm afternoons",
      };
    case 7:
      return {
        key: "summer",
        label: "High summer",
        blurb:
          "warm afternoons, hazy mountains, crowded lakes, and passing thunderstorms",
      };
    case 8:
      return {
        key: "late-summer",
        label: "Late summer",
        blurb:
          "warm days, cool nights, goldenrod, and the first subtle hints of autumn",
      };
    case 9:
      return day < 22
        ? {
            key: "late-summer",
            label: "Late summer",
            blurb:
              "warm afternoons, cool nights, and maples just starting to turn",
          }
        : {
            key: "early-autumn",
            label: "Early autumn",
            blurb:
              "crisp air, the first red maples, and golden light across campus",
          };
    case 10:
      return {
        key: "autumn",
        label: "Fall foliage",
        blurb:
          "maples turning red and gold across the Lakes Region, with fallen leaves underfoot",
      };
    case 11:
      return day < 16
        ? {
            key: "late-autumn",
            label: "Late autumn",
            blurb:
              "stick season, bare trees, brown grass, and the first real snows possible",
          }
        : {
            key: "early-winter",
            label: "Early winter",
            blurb:
              "bare trees, cold rain, and the first accumulating snow",
          };
    case 12:
      return {
        key: "early-winter",
        label: "Early winter",
        blurb:
          "long nights, holiday lights, and snow beginning to settle in",
      };
    default:
      return {
        key: "autumn",
        label: "Autumn",
        blurb: "cool air and turning leaves",
      };
  }
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function timeOfDayFor(
  now: Date,
  sunrise: Date,
  sunset: Date,
  dawn: Date,
  dusk: Date,
): { key: TimeOfDayKey; label: string; hour: number; minute: number } {
  const { hour, minute } = localParts(now, POINT.timeZone);
  const minutes = hour * 60 + minute;

  if (now < dawn) return { key: "night", label: "Deep night", hour, minute };
  if (now < sunrise)
    return { key: "pre-dawn", label: "Pre-dawn", hour, minute };
  if (now < addMinutes(sunrise, 90))
    return { key: "dawn", label: "Early morning light", hour, minute };
  if (minutes < 11 * 60 + 30)
    return { key: "morning", label: "Morning", hour, minute };
  if (minutes < 14 * 60)
    return { key: "midday", label: "Midday", hour, minute };
  if (now < addMinutes(sunset, -90))
    return { key: "afternoon", label: "Afternoon", hour, minute };
  if (now < sunset)
    return { key: "golden-hour", label: "Golden hour", hour, minute };
  if (now < dusk)
    return { key: "dusk", label: "Dusk", hour, minute };
  if (now < addMinutes(sunset, 180))
    return { key: "evening", label: "Evening", hour, minute };
  return { key: "night", label: "Night", hour, minute };
}

function pickCurrentPeriod(periods: NwsPeriod[], now: Date): NwsPeriod {
  const current = periods.find((period) => {
    const start = new Date(period.startTime);
    const end = new Date(period.endTime);
    return start <= now && now < end;
  });
  return current ?? periods[0];
}

function normalizeCurrent(period: NwsPeriod): WeatherCurrent {
  return {
    temperatureF: round(toFahrenheit(period.temperature, period.temperatureUnit)),
    shortForecast: period.shortForecast,
    isDaytime: period.isDaytime,
    windSpeed: period.windSpeed,
    windDirection: period.windDirection,
    precipChance: period.probabilityOfPrecipitation?.value ?? null,
    humidity: period.relativeHumidity?.value ?? null,
    dewpointF:
      period.dewpoint?.value == null
        ? null
        : round(
            toFahrenheit(
              period.dewpoint.value,
              period.dewpoint.unitCode.includes("degC") ? "C" : "F",
            ),
          ),
    startTime: period.startTime,
  };
}

function normalizePeriod(period: NwsPeriod): WeatherPeriod {
  return {
    name: period.name,
    startTime: period.startTime,
    endTime: period.endTime,
    isDaytime: period.isDaytime,
    temperatureF: round(toFahrenheit(period.temperature, period.temperatureUnit)),
    shortForecast: period.shortForecast,
    detailedForecast: period.detailedForecast,
    windSpeed: period.windSpeed,
    windDirection: period.windDirection,
    precipChance: period.probabilityOfPrecipitation?.value ?? null,
  };
}

function buildSummary(
  now: Date,
  current: WeatherCurrent,
  periods: WeatherPeriod[],
  season: { label: string; blurb: string },
  timeOfDay: { label: string },
  sun: { sunrise: string; sunset: string; isDaylight: boolean },
): string {
  const upcoming = periods
    .slice(0, 5)
    .map((period) => {
      const highLow = period.isDaytime ? "high" : "low";
      const precip =
        period.precipChance == null
          ? ""
          : `, ${period.precipChance}% precipitation`;
      return `${period.name}: ${highLow} ${period.temperatureF}°F, ${period.shortForecast}${precip}`;
    })
    .join("; ");

  const sunrise = formatClock(new Date(sun.sunrise), POINT.timeZone);
  const sunset = formatClock(new Date(sun.sunset), POINT.timeZone);

  return [
    `Location: ${POINT.name} (${POINT.lat} N, ${Math.abs(POINT.lon)} W)`,
    `Local time: ${formatLocalDate(now, POINT.timeZone)} at ${formatLocalTime(now, POINT.timeZone)}`,
    `Season: ${season.label} — ${season.blurb}`,
    `Time of day: ${timeOfDay.label} — ${sun.isDaylight ? "daylight" : "darkness"}; sunrise ${sunrise}, sunset ${sunset}`,
    `Current: ${current.temperatureF}°F, ${current.shortForecast}, wind ${current.windSpeed} ${current.windDirection}${
      current.precipChance == null
        ? ""
        : `, ${current.precipChance}% chance of precipitation`
    }${current.humidity == null ? "" : `, ${current.humidity}% humidity`}`,
    `Upcoming: ${upcoming}`,
  ].join("\n");
}

export async function getWeather(force = false): Promise<Weather> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }

  const pointsUrl = `https://api.weather.gov/points/${POINT.lat},${POINT.lon}`;
  const points = await getJsonWithRetry<NwsPointsResponse>(pointsUrl);

  const [hourly, daily] = await Promise.all([
    getJsonWithRetry<NwsForecastResponse>(
      points.properties.forecastHourly,
    ),
    getJsonWithRetry<NwsForecastResponse>(points.properties.forecast),
  ]);

  const now = new Date();
  const currentPeriod = pickCurrentPeriod(hourly.properties.periods, now);
  const current = normalizeCurrent(currentPeriod);
  const periods = daily.properties.periods.slice(0, 6).map(normalizePeriod);

  const sunTimes = getTimes(now, POINT.lat, POINT.lon);
  const requireTime = (value: Date | null, label: string): Date => {
    if (!value) {
      throw new Error(`Could not compute ${label} for Plymouth, NH`);
    }
    return value;
  };
  const sunrise = requireTime(sunTimes.sunrise, "sunrise");
  const sunset = requireTime(sunTimes.sunset, "sunset");
  const dawn = requireTime(sunTimes.dawn, "dawn");
  const dusk = requireTime(sunTimes.dusk, "dusk");
  const isDaylight = now >= sunrise && now <= sunset;

  const parts = localParts(now, POINT.timeZone);
  const season = seasonFor(parts.month, parts.day);
  const timeOfDay = timeOfDayFor(now, sunrise, sunset, dawn, dusk);

  const sun = {
    sunrise: sunrise.toISOString(),
    sunset: sunset.toISOString(),
    dawn: dawn.toISOString(),
    dusk: dusk.toISOString(),
    isDaylight,
    daylightMinutes: Math.round(
      (sunset.getTime() - sunrise.getTime()) / 60_000,
    ),
  };

  const summary = buildSummary(
    now,
    current,
    periods,
    season,
    timeOfDay,
    sun,
  );

  const precipitationBucket = Math.round((current.precipChance ?? 0) / 20);
  const dateKey = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  const conditionsKey = createHash("sha256")
    .update(
      [
        dateKey,
        timeOfDay.key,
        season.key,
        Math.round(current.temperatureF / 5) * 5,
        current.shortForecast,
        current.isDaytime,
        precipitationBucket,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 16);

  const weather: Weather = {
    location: {
      name: POINT.name,
      lat: POINT.lat,
      lon: POINT.lon,
      timeZone: POINT.timeZone,
    },
    fetchedAt: now.toISOString(),
    observedAt: current.startTime,
    localDate: formatLocalDate(now, POINT.timeZone),
    localTime: formatLocalTime(now, POINT.timeZone),
    current,
    periods,
    sun,
    season,
    timeOfDay,
    conditionsKey,
    summary,
  };

  cache = { at: Date.now(), data: weather };
  return weather;
}
