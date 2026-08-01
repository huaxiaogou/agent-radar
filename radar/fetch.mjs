import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";
import { Agent } from "undici";

const USER_AGENT = "AgentRadar/1.0 (+https://radar.jayjp.com)";
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const NATIVE_FETCH = globalThis.fetch;
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
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (isBlockedHostname(url.hostname)) return null;
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

function isBlockedIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 192 && b === 88 && c === 99)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224;
}

function parseIpv6Bytes(address) {
  let normalized = String(address || "").toLowerCase().split("%")[0];
  if (!normalized || normalized.includes(":::")) return null;
  const dottedSuffix = normalized.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (dottedSuffix) {
    const octets = dottedSuffix.split(".").map(Number);
    if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
    normalized = `${normalized.slice(0, -dottedSuffix.length)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (missing < (halves.length === 2 ? 1 : 0)) return null;
  const groups = [...left, ...Array(missing).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.flatMap((group) => {
    const value = Number.parseInt(group, 16);
    return [value >> 8, value & 0xff];
  });
}

function isBlockedAddress(address) {
  const normalized = String(address || "").toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const family = isIP(normalized);
  if (family === 4) return isBlockedIpv4(normalized);
  if (family !== 6) return true;
  const bytes = parseIpv6Bytes(normalized);
  if (!bytes) return true;
  const isUnspecified = bytes.every((byte) => byte === 0);
  const isLoopback = bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1;
  if (isUnspecified || isLoopback) return true;
  if ((bytes[0] & 0xfe) === 0xfc || (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) || bytes[0] === 0xff) return true;
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return true;
  const isIpv4Mapped = bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  const isIpv4Compatible = bytes.slice(0, 12).every((byte) => byte === 0);
  if (isIpv4Mapped || isIpv4Compatible) return isBlockedIpv4(bytes.slice(12).join("."));
  return false;
}

function isBlockedHostname(hostname) {
  const normalized = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!normalized || normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local") || normalized.endsWith(".internal")) return true;
  if (["metadata.google.internal", "metadata.google", "instance-data.ec2.internal"].includes(normalized)) return true;
  return isIP(normalized) ? isBlockedAddress(normalized) : false;
}

async function defaultResolveHostname(hostname) {
  return lookup(hostname, { all: true, verbatim: true });
}

async function resolvePublicTarget(input, resolveHostname) {
  const normalized = canonicalizeUrl(input);
  if (!normalized) throw new Error("抓取目标必须是无凭据的公网 HTTPS URL");
  const url = new URL(normalized);
  const literalAddress = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(literalAddress)) {
    return { normalized, hostname: url.hostname, addresses: [{ address: literalAddress, family: isIP(literalAddress) }] };
  }
  let addresses;
  try {
    addresses = await resolveHostname(url.hostname);
  } catch {
    throw new Error(`抓取目标 DNS 解析失败：${url.hostname}`);
  }
  const normalizedAddresses = Array.isArray(addresses) ? addresses.map((entry) => {
    const address = String(entry?.address || entry || "").replace(/^\[|\]$/g, "").split("%")[0];
    return { address, family: Number(entry?.family) || isIP(address) };
  }) : [];
  if (!normalizedAddresses.length || normalizedAddresses.some((entry) => !entry.family || isBlockedAddress(entry.address))) {
    throw new Error(`抓取目标解析到非公网地址：${url.hostname}`);
  }
  return { normalized, hostname: url.hostname, addresses: normalizedAddresses };
}

export async function validatePublicTarget(input, { resolveHostname = defaultResolveHostname } = {}) {
  return (await resolvePublicTarget(input, resolveHostname)).normalized;
}

function pinnedLookup(addresses) {
  return (_hostname, options, callback) => {
    const settings = typeof options === "object" && options ? options : {};
    const done = typeof options === "function" ? options : callback;
    const requestedFamily = typeof options === "number" ? options : Number(settings.family || 0);
    const eligible = requestedFamily ? addresses.filter((entry) => entry.family === requestedFamily) : addresses;
    if (!eligible.length) {
      const error = new Error("已校验的 DNS 结果不包含请求的地址族");
      error.code = "EAI_NONAME";
      done(error);
      return;
    }
    if (settings.all) done(null, eligible.map((entry) => ({ ...entry })));
    else done(null, eligible[0].address, eligible[0].family);
  };
}

function defaultCreateDispatcher({ addresses }) {
  return new Agent({ connect: { lookup: pinnedLookup(addresses) } });
}

async function cancelResponseBody(response) {
  try {
    await response.body?.cancel?.();
  } catch {}
}

async function readBoundedResponseBody(response) {
  if (!response.body?.getReader) {
    const body = await response.text();
    if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) throw new Error("响应超过 5 MiB");
    return body;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  let cancelled = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      // For an unframed stream, reaching the cap cannot be distinguished from
      // exceeding it without asking the producer for another chunk. Stop at
      // the boundary so a queued next chunk cannot close before cancellation.
      if (totalBytes >= MAX_RESPONSE_BYTES) {
        cancelled = true;
        await reader.cancel();
        throw new Error("响应超过 5 MiB");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (!cancelled) {
      try {
        await reader.cancel();
      } catch {}
    }
    throw error;
  }
  return Buffer.concat(chunks, totalBytes).toString("utf8");
}

export function contentHash(...parts) {
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

export async function fetchPublicText(url, options = {}) {
  const customFetch = Object.hasOwn(options, "fetchImpl");
  const fetchImpl = customFetch ? options.fetchImpl : NATIVE_FETCH;
  const { resolveHostname, createDispatcher = defaultCreateDispatcher, maxRedirects = MAX_REDIRECTS } = options;
  if (customFetch && typeof resolveHostname !== "function") {
    throw new Error("自定义 fetch 必须显式提供可信 DNS resolver");
  }
  if (typeof fetchImpl !== "function" || typeof createDispatcher !== "function") throw new Error("抓取网络适配器配置无效");
  const resolver = resolveHostname || defaultResolveHostname;
  let currentUrl = url;
  const visited = new Set();
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const target = await resolvePublicTarget(currentUrl, resolver);
    currentUrl = target.normalized;
    if (visited.has(currentUrl)) throw new Error("重定向循环");
    visited.add(currentUrl);
    const dispatcher = createDispatcher({ hostname: target.hostname, addresses: target.addresses });
    if (!dispatcher) throw new Error("无法绑定已校验的 DNS 结果");
    try {
      const response = await fetchImpl(currentUrl, {
        dispatcher,
        redirect: "manual",
        headers: {
          accept: "application/json, application/atom+xml, application/rss+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.5",
          "user-agent": USER_AGENT,
        },
        signal: AbortSignal.timeout(Number(process.env.RADAR_FETCH_TIMEOUT_MS || 15000)),
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw new Error(`HTTP ${response.status} 缺少 Location`);
        const redirected = canonicalizeUrl(location, currentUrl);
        if (!redirected) throw new Error("重定向目标不是公网 HTTPS URL");
        await response.body?.cancel();
        currentUrl = redirected;
        continue;
      }
      if (!response.ok) {
        await cancelResponseBody(response);
        throw new Error(`HTTP ${response.status}`);
      }
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > MAX_RESPONSE_BYTES) {
        await cancelResponseBody(response);
        throw new Error(`响应过大：${contentLength} bytes`);
      }
      const body = await readBoundedResponseBody(response);
      return { body, finalUrl: currentUrl, contentType: response.headers.get("content-type") || "" };
    } finally {
      await dispatcher.close?.();
    }
  }
  throw new Error(`重定向超过 ${maxRedirects} 次`);
}

async function fetchText(url, attempts = 2, fetchOptions = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchPublicText(url, fetchOptions);
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

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function githubIssueItems(document, source) {
  const rows = Array.isArray(document) ? document : asArray(document?.items);
  return rows.flatMap((issue) => {
    if (!issue || issue.pull_request) return [];
    const url = canonicalizeUrl(issue.html_url, source.homepage || source.url);
    const title = cleanText(issue.title, 260);
    if (!url || !title) return [];
    return [{
      title,
      url,
      excerpt: cleanText(issue.body || "", 2800),
      publishedAt: normalizeDate(issue.created_at || issue.updated_at),
      engagementCount: numeric(issue.comments),
    }];
  });
}

function blueskyItems(document) {
  return asArray(document?.posts).flatMap((post) => {
    const uri = String(post?.uri || "");
    const rkey = uri.split("/").filter(Boolean).at(-1);
    const handle = cleanText(post?.author?.handle, 200);
    const title = cleanText(post?.record?.text || post?.text || "", 260);
    const url = handle && rkey ? canonicalizeUrl(`https://bsky.app/profile/${handle}/post/${rkey}`) : null;
    if (!url || !title) return [];
    return [{
      title,
      url,
      excerpt: cleanText(post?.record?.text || post?.text || "", 2800),
      publishedAt: normalizeDate(post?.record?.createdAt || post?.indexedAt),
      engagementCount: numeric(post?.replyCount) + numeric(post?.repostCount) + numeric(post?.likeCount) + numeric(post?.quoteCount),
    }];
  });
}

function hackerNewsItems(document) {
  return asArray(document?.hits).flatMap((hit) => {
    const id = String(hit?.objectID || hit?.story_id || "").trim();
    const title = cleanText(hit?.title || hit?.story_title || hit?.comment_text || "", 260);
    const url = id ? canonicalizeUrl(`https://news.ycombinator.com/item?id=${encodeURIComponent(id)}`) : null;
    if (!url || !title) return [];
    return [{
      title,
      url,
      excerpt: cleanText(hit?.story_text || hit?.comment_text || "", 2800),
      publishedAt: normalizeDate(hit?.created_at || (hit?.created_at_i ? new Date(numeric(hit.created_at_i) * 1000).toISOString() : null)),
      engagementCount: numeric(hit?.points) + numeric(hit?.num_comments),
    }];
  });
}

export function parseJsonSource(body, source) {
  let document;
  try {
    document = typeof body === "string" ? JSON.parse(body) : body;
  } catch (error) {
    throw new Error(`JSON 来源解析失败：${error instanceof Error ? error.message : String(error)}`);
  }
  let items;
  if (source.parser === "github-issues") items = githubIssueItems(document, source);
  else if (source.parser === "bluesky-search") items = blueskyItems(document);
  else if (source.parser === "hacker-news") items = hackerNewsItems(document);
  else throw new Error(`不支持的 JSON 来源解析器：${source.parser || "未配置"}`);
  return items.slice(0, source.maxItems || 12);
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

export async function discoverSourceItems(source, fetchOptions = {}) {
  const { body, finalUrl, contentType } = await fetchText(source.url, 2, fetchOptions);
  if (source.kind === "json") return parseJsonSource(body, source);
  const looksLikeXml = /xml|rss|atom/i.test(contentType) || /^\s*<\?xml|^\s*<(rss|feed)\b/i.test(body);
  if (source.kind === "feed" || looksLikeXml) return parseFeed(body, source);
  return parseHtml(body, finalUrl, source);
}

export async function enrichItem(item, fetchOptions = {}) {
  if (new URL(item.url).hash && item.excerpt) {
    return { ...item, contentText: item.excerpt };
  }
  if (item.excerpt?.length >= 900 && item.publishedAt) {
    return { ...item, contentText: item.excerpt };
  }
  try {
    const { body, finalUrl, contentType } = await fetchText(item.url, 1, fetchOptions);
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
