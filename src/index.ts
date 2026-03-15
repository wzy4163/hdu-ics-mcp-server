import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as ical from "node-ical";
import { z } from "zod";

const ICS_URL = process.env.ICS_URL;
const CALENDAR_TIMEZONE = process.env.CALENDAR_TIMEZONE ?? "Asia/Shanghai";
const DEFAULT_CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const ICS_CACHE_TTL_MS = parsePositiveInteger(
  process.env.ICS_CACHE_TTL_MS,
  DEFAULT_CACHE_TTL_MS
);
const CACHE_DIR_PATH = join(__dirname, "..", ".cache");
const CACHE_FILE_PATH = join(CACHE_DIR_PATH, "ics-cache.json");

if (!ICS_URL) {
  console.error("ICS_URL is not set. Please configure it in .env");
  process.exit(1);
}

// --- Helpers ---
interface CalendarEvent {
  name: string;
  start: string;
  end: string;
  location: string;
  description: string;
}

interface CalendarCache {
  cacheKey: string;
  events: ical.VEvent[];
  rawIcs: string;
  lastRefreshAt: number;
  lastRefreshDay: string;
  expiresAt: number;
}

interface SerializedCalendarCache {
  cacheKey: string;
  rawIcs: string;
  lastRefreshAt: string;
  lastRefreshDay: string;
}

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const timeZoneFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CALENDAR_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

let calendarCache: CalendarCache | null = null;

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function getCacheKey(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const identity = parsedUrl.searchParams.get("staffId");

    if (identity) {
      return `identity:${hashValue(identity)}`;
    }
  } catch {
    return `url:${hashValue(url)}`;
  }

  return `url:${hashValue(url)}`;
}

function formatDate(d: Date): string {
  return d.toLocaleString("zh-CN", {
    timeZone: CALENDAR_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
}

function toCalendarEvent(ev: ical.VEvent): CalendarEvent {
  return {
    name: ev.summary ?? "(无标题)",
    start: formatDate(new Date(ev.start)),
    end: formatDate(new Date(ev.end)),
    location: ev.location ?? "",
    description: ev.description ?? "",
  };
}

function formatEventList(events: CalendarEvent[]): string {
  if (events.length === 0) return "没有找到相关事件。";
  return events
    .map(
      (e, i) =>
        `${i + 1}. ${e.name}\n` +
        `   时间: ${e.start} ~ ${e.end}\n` +
        (e.location ? `   地点: ${e.location}\n` : "") +
        (e.description ? `   描述: ${e.description}\n` : "")
    )
    .join("\n");
}

function getTimeZoneParts(date: Date): DateParts {
  const parts = timeZoneFormatter.formatToParts(date);
  const getPartValue = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((item) => item.type === type);
    if (!part) {
      throw new Error(`Missing date part: ${type}`);
    }
    return Number.parseInt(part.value, 10);
  };

  return {
    year: getPartValue("year"),
    month: getPartValue("month"),
    day: getPartValue("day"),
    hour: getPartValue("hour"),
    minute: getPartValue("minute"),
    second: getPartValue("second"),
  };
}

function getTimeZoneOffsetMs(date: Date): number {
  const parts = getTimeZoneParts(date);
  const utcTimestamp = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    0
  );
  return utcTimestamp - date.getTime();
}

function zonedDateTimeToUtc(
  parts: DateParts & { millisecond?: number }
): Date {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond ?? 0
  );
  const initialOffset = getTimeZoneOffsetMs(new Date(utcGuess));
  let adjustedTimestamp = utcGuess - initialOffset;
  const adjustedOffset = getTimeZoneOffsetMs(new Date(adjustedTimestamp));

  if (adjustedOffset !== initialOffset) {
    adjustedTimestamp = utcGuess - adjustedOffset;
  }

  return new Date(adjustedTimestamp);
}

function addCalendarDays(parts: DateParts, days: number): DateParts {
  const shiftedDate = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days)
  );

  return {
    year: shiftedDate.getUTCFullYear(),
    month: shiftedDate.getUTCMonth() + 1,
    day: shiftedDate.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0,
  };
}

function getDayKey(date: Date): string {
  const parts = getTimeZoneParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day
  ).padStart(2, "0")}`;
}

async function parseEvents(rawIcs: string): Promise<ical.VEvent[]> {
  const data = await ical.async.parseICS(rawIcs);
  return Object.values(data).filter(
    (item): item is ical.VEvent => item.type === "VEVENT"
  );
}

async function fetchIcsText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ICS 请求失败：HTTP ${response.status}`);
  }

  return response.text();
}

function toCalendarCache(
  cacheKey: string,
  rawIcs: string,
  events: ical.VEvent[],
  refreshedAt: Date
): CalendarCache {
  const lastRefreshAt = refreshedAt.getTime();
  return {
    cacheKey,
    rawIcs,
    events,
    lastRefreshAt,
    lastRefreshDay: getDayKey(refreshedAt),
    expiresAt: lastRefreshAt + ICS_CACHE_TTL_MS,
  };
}

function shouldRefreshCache(cache: CalendarCache, now: Date): boolean {
  const currentTime = now.getTime();
  const todayKey = getDayKey(now);

  if (cache.lastRefreshDay !== todayKey) {
    return true;
  }

  return currentTime >= cache.expiresAt;
}

async function readCacheFromDisk(cacheKey: string): Promise<CalendarCache | null> {
  try {
    const raw = await readFile(CACHE_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<SerializedCalendarCache>;

    if (
      typeof parsed.cacheKey !== "string" ||
      typeof parsed.rawIcs !== "string" ||
      typeof parsed.lastRefreshAt !== "string" ||
      typeof parsed.lastRefreshDay !== "string" ||
      parsed.cacheKey !== cacheKey
    ) {
      return null;
    }

    const refreshedAt = new Date(parsed.lastRefreshAt);
    if (Number.isNaN(refreshedAt.getTime())) {
      return null;
    }

    const events = await parseEvents(parsed.rawIcs);
    return toCalendarCache(parsed.cacheKey, parsed.rawIcs, events, refreshedAt);
  } catch {
    return null;
  }
}

async function writeCacheToDisk(cache: CalendarCache): Promise<void> {
  const payload: SerializedCalendarCache = {
    cacheKey: cache.cacheKey,
    rawIcs: cache.rawIcs,
    lastRefreshAt: new Date(cache.lastRefreshAt).toISOString(),
    lastRefreshDay: cache.lastRefreshDay,
  };

  await mkdir(CACHE_DIR_PATH, { recursive: true });
  await writeFile(CACHE_FILE_PATH, JSON.stringify(payload), "utf8");
}

async function getCachedCalendar(cacheKey: string): Promise<CalendarCache | null> {
  if (calendarCache?.cacheKey === cacheKey) {
    return calendarCache;
  }

  const diskCache = await readCacheFromDisk(cacheKey);
  if (diskCache) {
    calendarCache = diskCache;
  } else {
    calendarCache = null;
  }

  return calendarCache;
}

async function refreshCalendarCache(
  cacheKey: string,
  refreshedAt: Date
): Promise<CalendarCache> {
  const rawIcs = await fetchIcsText(ICS_URL!);
  const events = await parseEvents(rawIcs);
  const cache = toCalendarCache(cacheKey, rawIcs, events, refreshedAt);
  calendarCache = cache;
  await writeCacheToDisk(cache);
  return cache;
}

async function fetchEvents(): Promise<ical.VEvent[]> {
  const now = new Date();
  const cacheKey = getCacheKey(ICS_URL!);
  const cached = await getCachedCalendar(cacheKey);

  if (cached && !shouldRefreshCache(cached, now)) {
    return cached.events;
  }

  try {
    const refreshed = await refreshCalendarCache(cacheKey, now);
    return refreshed.events;
  } catch (error) {
    if (cached) {
      return cached.events;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`无法获取 ICS 日历数据：${message}`);
  }
}

function getDayRange(d: Date): { start: Date; end: Date } {
  const parts = getTimeZoneParts(d);

  return {
    start: zonedDateTimeToUtc({
      ...parts,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    }),
    end: zonedDateTimeToUtc({
      ...parts,
      hour: 23,
      minute: 59,
      second: 59,
      millisecond: 999,
    }),
  };
}

function getUpcomingRange(d: Date, days: number): { start: Date; end: Date } {
  const start = getDayRange(d).start;
  const targetDayParts = addCalendarDays(getTimeZoneParts(d), days - 1);

  return {
    start,
    end: zonedDateTimeToUtc({
      ...targetDayParts,
      hour: 23,
      minute: 59,
      second: 59,
      millisecond: 999,
    }),
  };
}

function getEventsInRange(
  events: ical.VEvent[],
  rangeStart: Date,
  rangeEnd: Date
): ical.VEvent[] {
  return events
    .filter((ev) => {
      const start = new Date(ev.start);
      const end = new Date(ev.end);
      return start <= rangeEnd && end >= rangeStart;
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

function createToolTextResponse(text: string) {
  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
  };
}

function formatErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `⚠️ ${message}`;
}

// --- MCP Server ---

const server = new McpServer({
  name: "hdu-courses-and-exams",
  version: "1.0.0",
});

server.tool(
  "get_today_courses_and_exams",
  "获取今天的杭电课程、考试和日程安排",
  {},
  async () => {
    try {
      const events = await fetchEvents();
      const now = new Date();
      const { start, end } = getDayRange(now);
      const todayEvents = getEventsInRange(events, start, end).map(
        toCalendarEvent
      );

      return createToolTextResponse(
        `📅 今日课程与考试（${now.toLocaleDateString("zh-CN", {
          timeZone: CALENDAR_TIMEZONE,
        })}）：\n\n${formatEventList(todayEvents)}`
      );
    } catch (error) {
      return createToolTextResponse(formatErrorMessage(error));
    }
  }
);

server.tool(
  "get_upcoming_courses_and_exams",
  "获取未来 N 天的杭电课程、考试和日程安排",
  { days: z.number().min(1).max(90).default(7).describe("查询天数，默认 7 天") },
  async ({ days }) => {
    try {
      const events = await fetchEvents();
      const range = getUpcomingRange(new Date(), days);
      const upcoming = getEventsInRange(events, range.start, range.end).map(
        toCalendarEvent
      );

      return createToolTextResponse(
        `📅 未来 ${days} 天的课程与考试（含今天）：\n\n${formatEventList(
          upcoming
        )}`
      );
    } catch (error) {
      return createToolTextResponse(formatErrorMessage(error));
    }
  }
);

server.tool(
  "search_courses_and_exams",
  "按关键词搜索杭电课程、考试和日程（搜索名称、地点、描述）",
  { keyword: z.string().min(1).describe("搜索关键词") },
  async ({ keyword }) => {
    try {
      const events = await fetchEvents();
      const kw = keyword.toLowerCase();
      const matched = events
        .filter((ev) => {
          const text = [ev.summary, ev.location, ev.description]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return text.includes(kw);
        })
        .sort(
          (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
        )
        .map(toCalendarEvent);

      return createToolTextResponse(
        `🔍 搜索 "${keyword}" 的课程与考试结果：\n\n${formatEventList(
          matched
        )}`
      );
    } catch (error) {
      return createToolTextResponse(formatErrorMessage(error));
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Server failed to start:", err);
  process.exit(1);
});
