import { execFileSync } from "node:child_process";
import { lookup } from "node:dns/promises";
import { existsSync } from "node:fs";
import { isIP } from "node:net";
import puppeteer from "puppeteer-core";
import type { Browser } from "puppeteer-core";
import * as axe from "axe-core";

export type AxeNode = {
  html: string;
  target: string[];
  failureSummary?: string;
};

export type AxeViolation = {
  id: string;
  impact: "critical" | "serious" | "moderate" | "minor" | null;
  description: string;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: AxeNode[];
};

export type ScanResult = {
  url: string;
  finalUrl: string;
  violations: AxeViolation[];
  passes: number;
  incomplete: number;
  inapplicable: number;
};

const DEFAULT_VIEWPORT = { width: 1280, height: 900 };

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("URL is required");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withScheme);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are supported");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URLs with embedded credentials are not supported");
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw new Error("That URL points to a private or local address and cannot be scanned");
  }

  // Canonicalize so Site unique-key lookups collapse trivial URL variants.
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = "";
  parsed.pathname = parsed.pathname.toLowerCase();
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }

  // Drop tracking params — they shouldn't create distinct Site rows.
  const trackingPrefixes = ["utm_", "mc_", "fbclid", "gclid", "yclid"];
  const keysToDelete: string[] = [];
  parsed.searchParams.forEach((_v, key) => {
    const lower = key.toLowerCase();
    if (
      trackingPrefixes.some((p) =>
        p.endsWith("_") ? lower.startsWith(p) : lower === p,
      )
    ) {
      keysToDelete.push(key);
    }
  });
  for (const key of keysToDelete) parsed.searchParams.delete(key);

  return parsed.toString();
}

export async function scanUrl(url: string): Promise<ScanResult> {
  const target = normalizeUrl(url);
  const parsedTarget = new URL(target);
  await assertPublicHostname(parsedTarget.hostname);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (compatible; a11ymindBot/1.0; +https://www.a11ymind.ai)",
    );

    // Mitigate SSRF via sub-resource requests. The browser loads the target
    // page and every script/image/XHR that page kicks off; a malicious site
    // can redirect or fetch internal addresses. Re-validate each request's
    // hostname with a fresh DNS lookup before allowing it.
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      void (async () => {
        try {
          const reqUrl = new URL(request.url());
          if (reqUrl.protocol === "data:" || reqUrl.protocol === "blob:") {
            await request.continue();
            return;
          }
          if (reqUrl.protocol !== "http:" && reqUrl.protocol !== "https:") {
            await request.abort("blockedbyclient");
            return;
          }
          if (isBlockedHostname(reqUrl.hostname)) {
            await request.abort("blockedbyclient");
            return;
          }
          if (await hostnameResolvesToBlockedIp(reqUrl.hostname)) {
            await request.abort("blockedbyclient");
            return;
          }
          await request.continue();
        } catch {
          try {
            await request.abort("blockedbyclient");
          } catch {
            // Request may already be settled.
          }
        }
      })();
    });

    const response = await page.goto(target, {
      waitUntil: "networkidle2",
      timeout: 45_000,
    });
    if (!response || !response.ok()) {
      throw new Error(
        `Target returned ${response?.status() ?? "no response"}. Cannot scan.`,
      );
    }

    // Re-check the landed URL in case of redirect to a private address.
    const finalParsed = new URL(page.url());
    if (isBlockedHostname(finalParsed.hostname)) {
      throw new Error(
        "Target redirected to a private or local address and cannot be scanned",
      );
    }

    await page.evaluate(axe.source);
    const results = await page.evaluate(async () => {
      const runtimeAxe = (globalThis as { axe?: typeof axe }).axe;
      if (!runtimeAxe) {
        throw new Error("axe-core failed to initialize in the page context");
      }
      return runtimeAxe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
        },
      });
    });

    return {
      url: target,
      finalUrl: page.url(),
      violations: results.violations as AxeViolation[],
      passes: results.passes.length,
      incomplete: results.incomplete.length,
      inapplicable: results.inapplicable.length,
    };
  } finally {
    await browser.close();
  }
}

async function launchBrowser(): Promise<Browser> {
  if (process.env.GITHUB_ACTIONS === "true") {
    return puppeteer.launch({
      executablePath: githubActionsChromePath(),
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
      defaultViewport: DEFAULT_VIEWPORT,
    });
  }

  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    const { default: chromium } = await import("@sparticuz/chromium");
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: DEFAULT_VIEWPORT,
      executablePath: await chromium.executablePath(),
      headless: "shell",
    });
  }

  const localPuppeteer = await import("puppeteer");
  return (await localPuppeteer.default.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
    defaultViewport: DEFAULT_VIEWPORT,
  })) as unknown as Browser;
}

function githubActionsChromePath() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.GOOGLE_CHROME_BIN,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "google-chrome",
    "google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "chromium-browser",
    "chromium",
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const resolved = resolveExecutable(candidate);
    if (resolved) return resolved;
  }

  throw new Error(
    "Could not find Chrome on the GitHub Actions runner. Use ubuntu-latest or set CHROME_BIN.",
  );
}

function resolveExecutable(candidate: string): string | null {
  if (candidate.startsWith("/")) {
    return existsSync(candidate) ? candidate : null;
  }

  try {
    const resolved = execFileSync("which", [candidate], { encoding: "utf8" }).trim();
    return resolved || null;
  } catch {
    return null;
  }
}

async function assertPublicHostname(hostname: string) {
  if (isBlockedHostname(hostname)) {
    throw new Error("That URL points to a private or local address and cannot be scanned");
  }

  if (await hostnameResolvesToBlockedIp(hostname)) {
    throw new Error("That URL resolves to a private or local address and cannot be scanned");
  }
}

async function hostnameResolvesToBlockedIp(hostname: string): Promise<boolean> {
  if (isIP(hostname)) return isBlockedIp(hostname);
  const addresses = await lookup(hostname, { all: true, verbatim: true }).catch(() => []);
  if (addresses.length === 0) return false;
  return addresses.some((entry) => isBlockedIp(entry.address));
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!normalized) return true;
  if (
    normalized === "localhost" ||
    normalized === "0.0.0.0" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  ) {
    return true;
  }
  return isBlockedIp(normalized);
}

function isBlockedIp(value: string): boolean {
  const ipVersion = isIP(value);
  if (ipVersion === 4) return isBlockedIpv4(value);
  if (ipVersion === 6) return isBlockedIpv6(value);
  return false;
}

function isBlockedIpv4(value: string): boolean {
  const octets = value.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => Number.isNaN(part))) return false;

  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isBlockedIpv6(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}
