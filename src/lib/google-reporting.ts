import { createSign } from "node:crypto";

// Read-only reporting from Google Analytics 4 and Search Console, for the
// /admin/analytics dashboard.
//
// ONE SERVICE ACCOUNT, TWO GRANTS. The account is a robot Google user. It reads
// GA4 because it was added as a Viewer on the property, and it reads Search
// Console because it was added as a (restricted) user on the site. Neither grant
// can change anything, and the scopes below are the readonly ones, so a leaked
// key exposes traffic numbers and nothing else.
//
// NO googleapis DEPENDENCY. Both APIs are plain JSON over HTTPS once you hold an
// access token, and the token is one signed JWT exchanged at Google's token
// endpoint. That is forty lines here against a multi-megabyte package.
//
// UNSET IS A WORKING STATE, same deal as lib/stripe and lib/opinly-server: with
// no credentials the dashboard says what is missing instead of throwing.

const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
].join(" ");

// The GA4 *property* ID (numeric, from Admin > Property details), not the
// G-XXXX measurement ID the browser tag uses. They name different things.
const PROPERTY_ID = process.env.GA4_PROPERTY_ID;
const GSC_SITE = process.env.GSC_SITE_URL || "sc-domain:masterkraft.com";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

// The whole key file as one env var, so there is nothing to split and no
// newline-escaping to get wrong: Vercel stores the JSON verbatim.
function serviceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!parsed.client_email || !parsed.private_key) return null;
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  } catch {
    return null;
  }
}

export function reportingStatus(): { ga4: boolean; gsc: boolean; missing: string[] } {
  const missing: string[] = [];
  const sa = serviceAccount();
  if (!sa) missing.push("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!PROPERTY_ID) missing.push("GA4_PROPERTY_ID");
  return { ga4: !!sa && !!PROPERTY_ID, gsc: !!sa, missing };
}

export function serviceAccountEmail(): string | null {
  return serviceAccount()?.client_email ?? null;
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

let token: { value: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const sa = serviceAccount();
  if (!sa) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPES,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: json.access_token, expires: Date.now() + json.expires_in * 1000 };
  return token.value;
}

async function googlePost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${new URL(url).hostname} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------- dates

export interface Range {
  days: number;
  start: string; // inclusive, YYYY-MM-DD
  end: string;
  prevStart: string;
  prevEnd: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

// Ends YESTERDAY, not today: a part-day sitting at the end of a trend line reads
// as a crash. Search Console lags a further two to three days, which is why its
// series is trimmed separately below rather than shifting this whole range.
export function rangeFor(days: number): Range {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1));
  return { days, start: iso(start), end: iso(end), prevStart: iso(prevStart), prevEnd: iso(prevEnd) };
}

// ---------------------------------------------------------------- GA4

interface Ga4Row {
  dimensionValues?: { value: string }[];
  metricValues?: { value: string }[];
}
interface Ga4Response {
  rows?: Ga4Row[];
}

function ga4(body: Record<string, unknown>) {
  return googlePost<Ga4Response>(
    `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:runReport`,
    body,
  );
}

const num = (v: string | undefined) => Number(v ?? 0) || 0;

export interface Totals {
  users: number;
  sessions: number;
  engagementRate: number;
  keyEvents: number;
  purchases: number;
  revenue: number;
}

export interface TrafficReport {
  totals: Totals;
  prevTotals: Totals;
  daily: { date: string; sessions: number; prevSessions: number }[];
  channels: { name: string; sessions: number; keyEvents: number }[];
  pages: { path: string; views: number; users: number }[];
  events: { name: string; count: number }[];
}

const TOTAL_METRICS = [
  "activeUsers",
  "sessions",
  "engagementRate",
  "keyEvents",
  "ecommercePurchases",
  "purchaseRevenue",
].map((name) => ({ name }));

function totalsFrom(row: Ga4Row | undefined): Totals {
  const m = row?.metricValues ?? [];
  return {
    users: num(m[0]?.value),
    sessions: num(m[1]?.value),
    engagementRate: num(m[2]?.value),
    keyEvents: num(m[3]?.value),
    purchases: num(m[4]?.value),
    revenue: num(m[5]?.value),
  };
}

// The funnel this site actually fires - see lib/analytics. Listed rather than
// "top events" so page_view and scroll don't crowd out the ones that matter.
const FUNNEL = ["view_item", "add_to_cart", "begin_checkout", "purchase", "generate_lead", "search"];

export async function trafficReport(r: Range): Promise<TrafficReport> {
  const both = [
    { startDate: r.start, endDate: r.end, name: "current" },
    { startDate: r.prevStart, endDate: r.prevEnd, name: "previous" },
  ];
  const [totals, daily, channels, pages, events] = await Promise.all([
    ga4({ dateRanges: both, metrics: TOTAL_METRICS }),
    ga4({
      dateRanges: both,
      dimensions: [{ name: "nthDay" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ dimension: { dimensionName: "nthDay" } }],
      limit: 400,
    }),
    ga4({
      dateRanges: [both[0]],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }, { name: "keyEvents" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
    }),
    ga4({
      dateRanges: [both[0]],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 10,
    }),
    ga4({
      dateRanges: [both[0]],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: FUNNEL } } },
    }),
  ]);

  // With two date ranges GA4 appends a `dateRange` dimension to every row, so
  // totals come back as two rows tagged "current" / "previous".
  const byRange = (rows: Ga4Row[] | undefined, name: string) =>
    (rows ?? []).filter((row) => row.dimensionValues?.at(-1)?.value === name);

  // nthDay ("0000", "0001", ...) lines the two periods up day-for-day, which a
  // calendar date cannot do. The label comes from the current range's start.
  const cur = new Map(byRange(daily.rows, "current").map((x) => [x.dimensionValues![0].value, num(x.metricValues?.[0]?.value)]));
  const prev = new Map(byRange(daily.rows, "previous").map((x) => [x.dimensionValues![0].value, num(x.metricValues?.[0]?.value)]));
  const series = Array.from({ length: r.days }, (_, i) => {
    const key = String(i).padStart(4, "0");
    const d = new Date(`${r.start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { date: iso(d), sessions: cur.get(key) ?? 0, prevSessions: prev.get(key) ?? 0 };
  });

  const eventCounts = new Map((events.rows ?? []).map((x) => [x.dimensionValues![0].value, num(x.metricValues?.[0]?.value)]));

  return {
    totals: totalsFrom(byRange(totals.rows, "current")[0]),
    prevTotals: totalsFrom(byRange(totals.rows, "previous")[0]),
    daily: series,
    channels: (channels.rows ?? []).map((x) => ({
      name: x.dimensionValues![0].value,
      sessions: num(x.metricValues?.[0]?.value),
      keyEvents: num(x.metricValues?.[1]?.value),
    })),
    pages: (pages.rows ?? []).map((x) => ({
      path: x.dimensionValues![0].value,
      views: num(x.metricValues?.[0]?.value),
      users: num(x.metricValues?.[1]?.value),
    })),
    events: FUNNEL.map((name) => ({ name, count: eventCounts.get(name) ?? 0 })),
  };
}

// ---------------------------------------------------------------- Search Console

interface GscRow {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

function gsc(body: Record<string, unknown>) {
  return googlePost<{ rows?: GscRow[] }>(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE)}/searchAnalytics/query`,
    { dataState: "all", ...body },
  );
}

export interface SearchTotals {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  keywords: number;
}

export interface SearchReport {
  totals: SearchTotals;
  prevTotals: SearchTotals;
  daily: { date: string; clicks: number; impressions: number }[];
  keywords: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
  pages: { page: string; clicks: number; impressions: number; position: number }[];
  // SEMrush's "organic positions distribution": how many keywords sit in each band.
  positions: { band: string; keywords: number }[];
}

const BANDS: [string, number, number][] = [
  ["Top 3", 0, 3],
  ["4-10", 3, 10],
  ["11-20", 10, 20],
  ["21-50", 20, 50],
  ["51-100", 50, Infinity],
];

function searchTotals(rows: GscRow[] | undefined, keywords: number): SearchTotals {
  const t = rows?.[0];
  return {
    clicks: t?.clicks ?? 0,
    impressions: t?.impressions ?? 0,
    ctr: t?.ctr ?? 0,
    position: t?.position ?? 0,
    keywords,
  };
}

export async function searchReport(r: Range): Promise<SearchReport> {
  const cur = { startDate: r.start, endDate: r.end };
  const prev = { startDate: r.prevStart, endDate: r.prevEnd };
  const [totals, prevTotals, daily, queries, prevQueries, pages] = await Promise.all([
    gsc(cur),
    gsc(prev),
    gsc({ ...cur, dimensions: ["date"], rowLimit: 500 }),
    gsc({ ...cur, dimensions: ["query"], rowLimit: 5000 }),
    gsc({ ...prev, dimensions: ["query"], rowLimit: 5000 }),
    gsc({ ...cur, dimensions: ["page"], rowLimit: 10 }),
  ]);

  const q = queries.rows ?? [];
  const positions = BANDS.map(([band, lo, hi]) => ({
    band,
    keywords: q.filter((row) => row.position > lo && row.position <= hi).length,
  }));

  return {
    totals: searchTotals(totals.rows, q.length),
    prevTotals: searchTotals(prevTotals.rows, prevQueries.rows?.length ?? 0),
    daily: (daily.rows ?? []).map((row) => ({ date: row.keys![0], clicks: row.clicks, impressions: row.impressions })),
    keywords: [...q]
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
      .slice(0, 25)
      .map((row) => ({ query: row.keys![0], clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position })),
    pages: (pages.rows ?? []).map((row) => ({
      page: row.keys![0].replace(/^https?:\/\/[^/]+/, "") || "/",
      clicks: row.clicks,
      impressions: row.impressions,
      position: row.position,
    })),
    positions,
  };
}
