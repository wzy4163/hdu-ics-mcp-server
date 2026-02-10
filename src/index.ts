import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as ical from "node-ical";
import { z } from "zod";

const ICS_URL = process.env.ICS_URL;
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

function formatDate(d: Date): string {
  return d.toLocaleString("zh-CN", {
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

async function fetchEvents(): Promise<ical.VEvent[]> {
  const data = await ical.async.fromURL(ICS_URL!);
  return Object.values(data).filter(
    (item): item is ical.VEvent => item.type === "VEVENT"
  );
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

// --- MCP Server ---

const server = new McpServer({
  name: "ics-calendar",
  version: "1.0.0",
});

server.tool("get_today_events", "获取今天的所有课程和考试", {}, async () => {
  const events = await fetchEvents();
  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);

  const todayEvents = events
    .filter((ev) => {
      const start = new Date(ev.start);
      const end = new Date(ev.end);
      return start <= dayEnd && end >= dayStart;
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .map(toCalendarEvent);

  return {
    content: [
      {
        type: "text" as const,
        text: `📅 今日事件（${now.toLocaleDateString("zh-CN")}）：\n\n${formatEventList(todayEvents)}`,
      },
    ],
  };
});

server.tool(
  "get_upcoming_events",
  "获取未来 N 天的事件",
  { days: z.number().min(1).max(90).default(7).describe("查询天数，默认 7 天") },
  async ({ days }) => {
    const events = await fetchEvents();
    const now = new Date();
    const rangeStart = startOfDay(now);
    const rangeEnd = endOfDay(
      new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
    );

    const upcoming = events
      .filter((ev) => {
        const start = new Date(ev.start);
        const end = new Date(ev.end);
        return start <= rangeEnd && end >= rangeStart;
      })
      .sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
      )
      .map(toCalendarEvent);

    return {
      content: [
        {
          type: "text" as const,
          text: `📅 未来 ${days} 天的事件：\n\n${formatEventList(upcoming)}`,
        },
      ],
    };
  }
);

server.tool(
  "search_events",
  "按关键词搜索事件（搜索名称、地点、描述）",
  { keyword: z.string().min(1).describe("搜索关键词") },
  async ({ keyword }) => {
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

    return {
      content: [
        {
          type: "text" as const,
          text: `🔍 搜索 "${keyword}" 的结果：\n\n${formatEventList(matched)}`,
        },
      ],
    };
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
