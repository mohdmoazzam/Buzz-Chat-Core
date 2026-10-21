import { lookup } from "dns/promises";
import { isIP } from "net";

// Fetching a URL a user typed is a classic SSRF hole: it must never reach localhost, the private
// network or a cloud metadata address. Every hop (including redirects) is checked before it's fetched.

export interface LinkPreview {
    url: string;
    title: string;
    description: string | null;
    image: string | null;
    site_name: string;
}

export const LINK_PREVIEW_QUEUE = "link-preview";
export interface LinkPreviewJob {
    message_id: string;
}

const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;
// The <head> with its meta tags is near the top; no need for the rest of the page
const MAX_BYTES = 512 * 1024;
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 300;
const USER_AGENT = "Mozilla/5.0 (compatible; BuzzChatBot/1.0; +link preview)";

// http(s) URLs in message text; trailing punctuation is dropped ("see https://x.com." -> the URL)
const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/i;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

/** The first http(s) link in a message's text, or null. */
export const firstUrl = (text: string | null | undefined): string | null => {
    const match = text?.match(URL_PATTERN)?.[0].replace(TRAILING_PUNCTUATION, "");
    if (!match) return null;
    try {
        return new URL(match).toString();
    } catch {
        return null;
    }
};

const ipv4ToInt = (ip: string) => ip.split(".").reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;
const inV4 = (ip: number, cidr: string) => {
    const [base, bits] = cidr.split("/");
    const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
    return (ip & mask) === (ipv4ToInt(base) & mask);
};
// Loopback, private, link-local (cloud metadata), carrier-grade NAT, benchmarking, multicast, reserved
const BLOCKED_V4 = [
    "0.0.0.0/8",
    "10.0.0.0/8",
    "100.64.0.0/10",
    "127.0.0.0/8",
    "169.254.0.0/16",
    "172.16.0.0/12",
    "192.0.0.0/24",
    "192.168.0.0/16",
    "198.18.0.0/15",
    "224.0.0.0/3",
];

/** Whether an IP address is on the public internet (anything internal or reserved is not). */
export const isPublicAddress = (ip: string): boolean => {
    const version = isIP(ip);
    if (version === 4) return !BLOCKED_V4.some((cidr) => inV4(ipv4ToInt(ip), cidr));
    if (version !== 6) return false;
    const v6 = ip.toLowerCase();
    // IPv4-mapped (::ffff:10.0.0.1) is judged as the IPv4 address it wraps
    const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicAddress(mapped[1]);
    if (v6 === "::" || v6 === "::1") return false;
    // fc00::/7 unique local, fe80::/10 link-local, ff00::/8 multicast
    return !/^(f[cd]|fe[89ab]|ff)/.test(v6);
};

/** Throws unless the URL is http(s) on a default port and every address its host resolves to is public. */
const assertSafeUrl = async (url: URL): Promise<void> => {
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http(s) links get previews");
    if (url.port && url.port !== "80" && url.port !== "443") throw new Error("Only default ports get previews");
    if (url.username || url.password) throw new Error("Links with credentials don't get previews");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(host) ? [host] : (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address);
    if (!addresses.length || !addresses.every(isPublicAddress)) throw new Error("That address isn't public");
};

/** Reads at most MAX_BYTES of the body as text. */
const readCapped = async (res: Response): Promise<string> => {
    const reader = res.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.byteLength;
    }
    await reader.cancel().catch(() => undefined);
    return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks).subarray(0, MAX_BYTES));
};

/** Fetches an HTML page, following (and re-checking) redirects by hand. Null when it isn't HTML or fails. */
const fetchHtml = async (start: string): Promise<{ html: string; url: string } | null> => {
    let url = new URL(start);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        await assertSafeUrl(url);
        const res = await fetch(url, {
            redirect: "manual",
            signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
        });
        const location = res.headers.get("location");
        if (res.status >= 300 && res.status < 400 && location) {
            url = new URL(location, url);
            continue;
        }
        if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
        return { html: await readCapped(res), url: url.toString() };
    }
    return null;
};

const decodeEntities = (text: string) =>
    text
        .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&");

const clean = (text: string | undefined, max: number) => {
    const value = text ? decodeEntities(text).replace(/\s+/g, " ").trim() : "";
    return value ? value.slice(0, max) : null;
};

/** Open Graph / Twitter / plain meta tags from a page's <head>. */
const parsePreview = (html: string, pageUrl: string): LinkPreview | null => {
    const headEnd = html.search(/<\/head>/i);
    const head = headEnd === -1 ? html : html.slice(0, headEnd);
    const meta = new Map<string, string>();
    for (const tag of head.match(/<meta\s[^>]*>/gi) ?? []) {
        const key = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
        const content = tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
        if (key && content && !meta.has(key)) meta.set(key, content[1] ?? content[2] ?? "");
    }
    const title = clean(
        meta.get("og:title") ?? meta.get("twitter:title") ?? head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1],
        TITLE_MAX,
    );
    if (!title) return null;

    let image: string | null = null;
    const rawImage = meta.get("og:image") ?? meta.get("og:image:url") ?? meta.get("twitter:image");
    if (rawImage) {
        try {
            const resolved = new URL(decodeEntities(rawImage), pageUrl);
            // Shown to everyone in the chat, so only plain https/http images
            if (resolved.protocol === "https:" || resolved.protocol === "http:") image = resolved.toString();
        } catch {
            image = null;
        }
    }
    return {
        url: pageUrl,
        title,
        description: clean(meta.get("og:description") ?? meta.get("twitter:description") ?? meta.get("description"), DESCRIPTION_MAX),
        image,
        site_name: clean(meta.get("og:site_name"), 100) ?? new URL(pageUrl).hostname.replace(/^www\./, ""),
    };
};

/** The preview for a link, or null when there's nothing worth showing (or it isn't safe to fetch). */
export const fetchLinkPreview = async (url: string): Promise<LinkPreview | null> => {
    const page = await fetchHtml(url);
    return page ? parsePreview(page.html, page.url) : null;
};
