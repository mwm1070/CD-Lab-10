export type SeasonKey =
  | "late-winter"
  | "early-spring"
  | "spring"
  | "late-spring"
  | "early-summer"
  | "summer"
  | "late-summer"
  | "early-autumn"
  | "autumn"
  | "late-autumn"
  | "early-winter"
  | "winter";

export type TimeOfDayKey =
  | "night"
  | "pre-dawn"
  | "dawn"
  | "morning"
  | "midday"
  | "afternoon"
  | "golden-hour"
  | "dusk"
  | "evening";

export type WeatherCurrent = {
  temperatureF: number;
  shortForecast: string;
  isDaytime: boolean;
  windSpeed: string;
  windDirection: string;
  precipChance: number | null;
  humidity: number | null;
  dewpointF: number | null;
  startTime: string;
};

export type WeatherPeriod = {
  name: string;
  startTime: string;
  endTime: string;
  isDaytime: boolean;
  temperatureF: number;
  shortForecast: string;
  detailedForecast: string;
  windSpeed: string;
  windDirection: string;
  precipChance: number | null;
};

export type Weather = {
  location: {
    name: string;
    lat: number;
    lon: number;
    timeZone: string;
  };
  fetchedAt: string;
  observedAt: string;
  localDate: string;
  localTime: string;
  current: WeatherCurrent;
  periods: WeatherPeriod[];
  sun: {
    sunrise: string;
    sunset: string;
    dawn: string;
    dusk: string;
    isDaylight: boolean;
    daylightMinutes: number;
  };
  season: {
    key: SeasonKey;
    label: string;
    blurb: string;
  };
  timeOfDay: {
    key: TimeOfDayKey;
    label: string;
    hour: number;
    minute: number;
  };
  conditionsKey: string;
  summary: string;
};

export type PromptSource = "llm" | "fallback";

export type Scene = {
  hash: string;
  imageUrl: string;
  prompt: string;
  promptSource: PromptSource;
  promptModel: string;
  imageModel: string;
  generatedAt: string;
  weatherKey: string;
  changed: boolean;
  difference: number;
  attempts: number;
  stale?: boolean;
};

export type SceneResponse = {
  scene: Scene | null;
  apiKeyConfigured: boolean;
  referenceReady: boolean;
};

export type ReferenceMeta = {
  title: string;
  artist: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  downloadUrl: string;
  downloadedAt: string;
};

export type ApiError = {
  error: string;
  hint?: string;
};
