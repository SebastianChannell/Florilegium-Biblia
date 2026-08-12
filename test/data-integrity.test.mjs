import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url).pathname;
const dist = join(root, "dist");
const catalog = JSON.parse(readFileSync(join(dist, "catalog.json"), "utf8"));

test("publishes the complete Catholic canon and appendix", () => {
  assert.equal(catalog.books.filter((book) => book.testament === "old").length, 46);
  assert.equal(catalog.books.filter((book) => book.testament === "new").length, 27);
  assert.equal(catalog.books.filter((book) => book.testament === "appendix").length, 3);
  assert.equal(catalog.books.length, 76);
  assert.equal(new Set(catalog.books.map((book) => book.slug)).size, catalog.books.length);
});

test("every reader entry has tagged, plain, and USFM files", () => {
  for (const book of catalog.books) {
    assert.ok(existsSync(join(dist, "data", "bible", `${book.slug}.json`)), book.slug);
    assert.ok(existsSync(join(dist, "downloads", "raw", `${book.slug}.json`)), book.slug);
    assert.ok(existsSync(join(dist, "downloads", "usfm", `${book.slug}.usfm`)), book.slug);
  }
});

test("chapters, notes, and annotations resolve to valid verses", () => {
  let verseCount = 0;
  let noteCount = 0;
  let annotationCount = 0;

  for (const book of catalog.books) {
    const data = JSON.parse(readFileSync(join(dist, "data", "bible", `${book.slug}.json`), "utf8"));
    assert.equal(data.chapters.length, book.chapters, `${book.slug}: chapter count`);

    for (const chapter of data.chapters) {
      const verseNumbers = new Set(chapter.verses.map((verse) => verse.verse));
      assert.equal(verseNumbers.size, chapter.verses.length, `${book.slug} ${chapter.chapter}: duplicate verse`);
      verseCount += chapter.verses.length;
      noteCount += chapter.verses.reduce((total, verse) => total + (verse.notes?.length ?? 0), 0);
    }

    for (const chapterNumber of book.annotationChapters) {
      const path = join(
        dist,
        "data",
        "annotations",
        book.slug,
        `${String(chapterNumber).padStart(3, "0")}.json`,
      );
      assert.ok(existsSync(path), `${book.slug} ${chapterNumber}: annotation sidecar`);
      const sidecar = JSON.parse(readFileSync(path, "utf8"));
      const chapter = data.chapters.find((entry) => Number(entry.chapter) === chapterNumber);
      assert.ok(chapter, `${book.slug} ${chapterNumber}: annotated chapter exists`);
      const verseNumbers = new Set(chapter.verses.map((verse) => verse.verse));
      for (const annotation of sidecar.annotations) {
        assert.ok(
          verseNumbers.has(annotation.verse),
          `${book.slug} ${chapterNumber}:${annotation.verse}: annotation verse exists`,
        );
        annotationCount += 1;
      }
    }
  }

  assert.ok(verseCount > 35_000, `expected the complete Bible, found ${verseCount} verses`);
  assert.ok(noteCount > 6_000, `expected translator notes, found ${noteCount}`);
  assert.ok(annotationCount > 1_000, `expected extended annotations, found ${annotationCount}`);
});

test("publishes every original reference document", () => {
  const sourceCount = ["ot", "nt"].reduce(
    (total, testament) =>
      total + readdirSync(join(root, "reference", testament)).filter((file) => file.endsWith(".json")).length,
    0,
  );
  assert.equal(catalog.reference.length, sourceCount);
  for (const document of catalog.reference) {
    assert.ok(existsSync(join(dist, document.path)), document.id);
  }
});
