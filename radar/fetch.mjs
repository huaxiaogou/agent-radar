import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";

const USER_AGENT = "AgentRadar/1.0 (+https://radar.jayjp.com)";
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const TRACKING_PARAMS = new Set([
  "fbclid", "gclid", "mc_cid", "mc_eid", "ref", "source",
  "utm_campaign", "utm_content", "utm_medium", "utm_source", "utm_term",
]);

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function valueText(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(valueText).join(" ");
  if (typeof value === "object") {
    return valueText(value["#text"] ?? value["#cdata"] ?? value.value ?? "");
  }
  return "";
}

export function cleanText(value, maxLength = 2400) {
  const $ = cheerio.load(`<div id="radar-clean">${value || ""}</div>`);
  $("script,style,noscript,svg,form,nav,footer").remove();
  const text = $("#radar-clean").text().replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

export function canonicalizeUrl(input, baseUrl) {
  try {
    const url = new URL(input, baseUrl);
    if (!/^https?:$/.test(url.protocol)) return null;
    if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(url.hostname)) return null;
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
        url.searchParams.delete(key);
      }
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function contentHash(...parts) {
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

async function fetchText(url, attempts = 2) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: {
          accept: "application/atom+xml, application/rss+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.5",
          "user-agent": USER_AGENT,
        },
        signal: AbortSignal.timeout(Number(process.env.RADAR_FETCH_TIMEOUT_MS || 15000)),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > MAX_RESPONSE_BYTES) throw new Error(`响应过大：${contentLength} bytes`);
      const body = await response.text();
      if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) throw new Error("响应超过 5 MiB");
      return { body, finalUrl: response.url, contentType: response.headers.get("content-type") || "" };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError;
}

function pickLink(value, baseUrl) {
  for (const link of asArray(value)) {
    const raw = typeof link === "object" ? (link.href || link.url || link["#text"]) : link;
    const relation = typeof link === "object" ? link.rel : undefined;
    if (relation && !["alternate", "self"].includes(relation)) continue;
    const normalized = canonicalizeUrl(valueText(raw), baseUrl);
    if (normalized) return normalized;
  }
  return null;
}

function parseFeed(body, source) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    textNodeName: "#text",
    cdataPropName: "#cdata",
    removeNSPrefix: false,
  });
  const document = parser.parse(body);
  const rssItems = asArray(document?.rss?.channel?.item);
  const atomItems = asArray(document?.feed?.entry);
  const items = rssItems.length ? rssItems : atomItems;

  return items.slice(0, source.maxItems || 12).flatMap((item) => {
    const title = cleanText(valueText(item.title), 260);
    const url = pickLink(item.link || item.guid || item.id, source.url);
    if (!title || !url) return [];
    const rawExcerpt = item["content:encoded"] || item.content || item.summary || item.description || "";
    const publishedAt = normalizeDate(item.pubDate || item.published || item.updated || item.date);
    return [{
      title,
      url,
      excerpt: cleanText(valueText(rawExcerpt), 2800),
      publishedAt,
    }];
  });
}

function collectHeadingSections($, pageUrl, limit) {
  const sections = [];
  $("main h2, main h3, article h2, article h3").each((_, element) => {
    if (sections.length >= limit) return false;
    const heading = $(element);
    const title = cleanText(heading.text(), 240);
    if (title.length < 8 || /table of contents|on this page|navigation/i.test(title)) return;
    const chunks = [];
    let cursor = heading.next();
    while (cursor.length && !cursor.is("h2,h3") && chunks.join(" ").length < 2400) {
      if (cursor.is("p,ul,ol,pre,blockquote")) chunks.push(cursor.text());
      cursor = cursor.next();
    }
    const excerpt = cleanText(chunks.join(" "), 2400);
    if (excerpt.length < 40) return;
    const anchor = heading.attr("id") || title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "").slice(0, 72);
    const url = new URL(pageUrl);
    url.hash = anchor || contentHash(title).slice(0, 10);
    sections.push({ title, url: url.toString(), excerpt, publishedAt: findDate(`${title} ${excerpt}`) });
  });
  return sections;
}

function parseClaudeChangelog($, pageUrl, limit) {
  $("script,style,noscript,svg,nav,footer,header,form,aside").remove();
  const text = $("main").text().replace(/\s+/g, " ").trim();
  const pattern = /\b(\d+\.\d+\.\d+)([A-Z][a-z]+ \d{1,2}, 20\d{2})\b/g;
  const matches = [...text.matchAll(pattern)];
  return matches.slice(0, limit).map((match, index) => {
    const start = (match.index || 0) + match[0].length;
    const end = matches[index + 1]?.index || text.length;
    const excerpt = cleanText(text.slice(start, end), 2800);
    const url = new URL(pageUrl);
    url.hash = match[1];
    return {
      title: `Claude Code ${match[1]}`,
      url: url.toString(),
      excerpt,
      publishedAt: normalizeDate(match[2]),
    };
  }).filter((item) => item.excerpt.length >= 30);
}

function matchesSourceRules(url, source) {
  if (!source.includeUrlPatterns?.length) return true;
  return source.includeUrlPatterns.some((pattern) => new RegExp(pattern, "i").test(url));
}

function parseHtml(body, pageUrl, source) {
  const $ = cheerio.load(body);
  if (source.parser === "claude-changelog") {
    return parseClaudeChangelog($, pageUrl, source.maxItems || 12);
  }
  $("script,style,noscript,svg,nav,footer,header,form,aside").remove();
  const candidates = [];
  const seen = new Set();
  const allowedHost = new URL(source.homepage).hostname.replace(/^www\./, "");

  $("main a[href], article a[href], a[href]").each((_, element) => {
    if (candidates.length >= (source.maxItems || 12) * 3) return false;
    const title = cleanText($(element).text() || $(element).attr("aria-label") || "", 260);
    const url = canonicalizeUrl($(element).attr("href"), pageUrl);
    if (!url || title.length < 10 || title.length > 240) return;
    if (!matchesSourceRules(url, source)) return;
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host !== allowedHost && !host.endsWith(`.${allowedHost}`)) return;
    if (seen.has(url) || /privacy|terms|cookie|sign in|log in|subscribe|contact|about us/i.test(title)) return;
    seen.add(url);
    const containerText = cleanText($(element).closest("article,li,section,div").text(), 1800);
    candidates.push({ title, url, excerpt: containerText, publishedAt: findDate(containerText) });
  });

  const sections = collectHeadingSections($, pageUrl, source.maxItems || 12);
  for (const item of sections) {
    if (!seen.has(item.url)) candidates.push(item);
  }

  return candidates.slice(0, source.maxItems || 12);
}

function normalizeDate(value) {
  const raw = valueText(value).trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function findDate(text) {
  const match = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (match) return normalizeDate(`${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}T00:00:00Z`);
  const named = text.match(/((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?) \d{1,2}, 20\d{2})/);
  return named ? normalizeDate(named[1]) : null;
}

function dateFromUrl(value) {
  try {
    const url = new URL(value);
    const numeric = url.pathname.match(/\/(20\d{2})\/(\d{1,2})\/(\d{1,2})(?:\/|$)/);
    if (numeric) return normalizeDate(`${numeric[1]}-${numeric[2].padStart(2, "0")}-${numeric[3].padStart(2, "0")}T00:00:00Z`);
    const named = url.pathname.match(/\/(20\d{2})\/([A-Z][a-z]{2})\/(\d{1,2})(?:\/|$)/);
    if (named) return normalizeDate(`${named[2]} ${named[3]}, ${named[1]}`);
  } catch {}
  return null;
}

export async function discoverSourceItems(source) {
  const { body, finalUrl, contentType } = await fetchText(source.url);
  const looksLikeXml = /xml|rss|atom/i.test(contentType) || /^\s*<\?xml|^\s*<(rss|feed)\b/i.test(body);
  if (source.kind === "feed" || looksLikeXml) return parseFeed(body, source);
  return parseHtml(body, finalUrl, source);
}

export async function enrichItem(item) {
  if (new URL(item.url).hash && item.excerpt) {
    return { ...item, contentText: item.excerpt };
  }
  if (item.excerpt?.length >= 900 && item.publishedAt) {
    return { ...item, contentText: item.excerpt };
  }
  try {
    const { body, finalUrl, contentType } = await fetchText(item.url, 1);
    if (!/html/i.test(contentType) && !/^\s*<!doctype html|^\s*<html/i.test(body)) {
      return { ...item, contentText: item.excerpt || "" };
    }
    const $ = cheerio.load(body);
    let structuredDate = null;
    $("script[type='application/ld+json']").each((_, element) => {
      if (structuredDate) return false;
      try {
        const data = JSON.parse($(element).text());
        const nodes = Array.isArray(data) ? data : data?.["@graph"] || [data];
        for (const node of nodes) {
          const value = node?.datePublished || node?.dateModified;
          if (value) {
            structuredDate = normalizeDate(value);
            break;
          }
        }
      } catch {}
    });
    $("script,style,noscript,svg,nav,footer,header,form,aside").remove();
    const metaDescription = $("meta[name='description']").attr("content") || $("meta[property='og:description']").attr("content") || "";
    const title = cleanText(item.title || $("meta[property='og:title']").attr("content") || $("h1").first().text(), 260);
    const articleText = cleanText($("article").first().text() || $("main").first().text() || $("body").text(), 7000);
    const publishedAt = item.publishedAt || normalizeDate(
      $("meta[property='article:published_time']").attr("content") || $("time[datetime]").first().attr("datetime"),
    ) || structuredDate || dateFromUrl(finalUrl) || findDate(articleText);
    return {
      ...item,
      title: title || item.title,
      url: new URL(item.url).hash ? item.url : (canonicalizeUrl(finalUrl, item.url) || item.url),
      excerpt: cleanText(item.excerpt || metaDescription || articleText, 2800),
      contentText: articleText || item.excerpt || metaDescription,
      publishedAt,
    };
  } catch {
    return { ...item, contentText: item.excerpt || "" };
  }
}
