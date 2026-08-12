import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../dist/${path}`, import.meta.url), "utf8");

test("site shell exposes navigation, notes, and original apparatus", () => {
  const html = read("index.html");
  for (const id of [
    "book-select",
    "chapter-select",
    "verses",
    "chapter-notes",
    "note-dialog",
    "reference-select",
    "reference-reader",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), id);
  }
  assert.match(html, /Notes &amp; annotations/);
  assert.match(html, /Original apparatus/);
});

test("uses the established Florilegium visual tokens", () => {
  const css = read("styles.css");
  assert.match(css, /--background:\s*#070606/i);
  assert.match(css, /--accent:\s*#8451cf/i);
  assert.match(css, /--gold:\s*#d7aa62/i);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /min-height:\s*100dvh/);
});

test("build output has secure static-hosting headers and an offline shell", () => {
  const headers = read("_headers");
  const serviceWorker = read("sw.js");
  assert.match(headers, /Content-Security-Policy:/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.doesNotMatch(serviceWorker, /__BUILD_HASH__/);
  assert.match(serviceWorker, /catalog\.json/);
});
