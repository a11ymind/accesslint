import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUrl } from "../src/lib/scan";

test("normalizeUrl canonicalizes host, path, fragments, and tracking params", () => {
  const normalized = normalizeUrl(
    "Example.COM/Some/Page/?utm_source=google&gclid=abc123&keep=1#section",
  );

  assert.equal(normalized, "https://example.com/some/page?keep=1");
});

test("normalizeUrl rejects embedded credentials", () => {
  assert.throws(
    () => normalizeUrl("https://user:pass@example.com"),
    /embedded credentials/i,
  );
});

test("normalizeUrl rejects obvious private and local hosts", () => {
  assert.throws(() => normalizeUrl("http://localhost:3000"), /private or local/i);
  assert.throws(() => normalizeUrl("http://127.0.0.1"), /private or local/i);
  assert.throws(() => normalizeUrl("http://192.168.1.5"), /private or local/i);
});
