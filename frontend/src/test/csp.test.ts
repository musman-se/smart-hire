/**
 * The Content-Security-Policy in nginx/security-headers.conf allows index.html's one
 * inline script by its hash. Edit the script without updating the hash and production
 * blocks it — silently, as far as any other test can tell. This one fails instead, and
 * names the hashes to paste in.
 */

import { describe, expect, it } from "vitest";

import headers from "../../nginx/security-headers.conf?raw";
import indexHtml from "../../index.html?raw";

async function cspHash(source: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return `'sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}'`;
}

const policy = headers.match(/Content-Security-Policy "([^"]+)"/)?.[1] ?? "";

describe("Content-Security-Policy", () => {
  it("allows index.html's inline script, with either line ending", async () => {
    const scripts = [...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? "");
    expect(scripts).toHaveLength(1);
    const lf = (scripts[0] ?? "").replace(/\r\n/g, "\n");
    const expected = [await cspHash(lf), await cspHash(lf.replace(/\n/g, "\r\n"))];

    const scriptSrc = policy.split(";").find((part) => part.trim().startsWith("script-src")) ?? "";
    for (const hash of expected) {
      expect(scriptSrc, `script-src should allow ${expected.join(" ")}`).toContain(hash);
    }
  });

  it("keeps the page from being framed or loading anything from elsewhere", () => {
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).not.toContain("unsafe-inline");
    expect(policy).not.toContain("unsafe-eval");
  });
});
