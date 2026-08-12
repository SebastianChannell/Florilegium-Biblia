import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  adjacentLocation,
  locationLabel,
  normalizeLocation,
  pageUrl,
  parsePageLocation,
} from "../public/navigation.js";

const catalog = JSON.parse(readFileSync(new URL("../dist/catalog.json", import.meta.url), "utf8"));

test("normalizes missing and invalid chapter locations", () => {
  assert.deepEqual(normalizeLocation(catalog, {}), { book: "genesis", chapter: 1 });
  assert.deepEqual(normalizeLocation(catalog, { book: "psalms", chapter: 999 }), {
    book: "psalms",
    chapter: 150,
  });
  assert.deepEqual(normalizeLocation(catalog, { book: "not-a-book", chapter: -2 }), {
    book: "genesis",
    chapter: 1,
  });
});

test("moves across book boundaries in canonical order", () => {
  assert.deepEqual(adjacentLocation(catalog, { book: "genesis", chapter: 1 }, -1), null);
  assert.deepEqual(adjacentLocation(catalog, { book: "genesis", chapter: 50 }, 1), {
    book: "exodus",
    chapter: 1,
  });
  assert.deepEqual(adjacentLocation(catalog, { book: "matthew", chapter: 1 }, -1), {
    book: "2-machabees",
    chapter: 15,
  });
  assert.deepEqual(adjacentLocation(catalog, { book: "prayer-of-manasses", chapter: 1 }, 1), null);
});

test("creates compact, shareable query URLs", () => {
  assert.equal(pageUrl({ book: "genesis", chapter: 1 }), "./");
  assert.equal(pageUrl({ book: "psalms", chapter: 50 }), "?book=psalms&chapter=50");
  assert.equal(
    pageUrl({ view: "apparatus", document: "nt/preface" }),
    "?view=apparatus&document=nt%2Fpreface",
  );
});

test("parses Scripture and apparatus URLs", () => {
  assert.deepEqual(
    parsePageLocation("https://example.test/?book=psalms&chapter=50", catalog),
    { view: "scripture", book: "psalms", chapter: 50, document: "" },
  );
  assert.deepEqual(
    parsePageLocation("https://example.test/?view=apparatus&document=nt%2Fpreface", catalog),
    { view: "apparatus", book: "genesis", chapter: 1, document: "nt/preface" },
  );
  assert.equal(locationLabel(catalog, { book: "apocalypse", chapter: 22 }), "Apocalypse 22");
});
