import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDirectory = join(root, "public");
const outputDirectory = join(root, "dist");
const taggedDirectory = join(root, "bible", "tagged");
const rawDirectory = join(root, "bible", "raw");
const annotationsDirectory = join(root, "annotations");
const referenceDirectory = join(root, "reference");
const usfmDirectory = join(root, "usfm");

const groups = [
  {
    id: "old",
    label: "Old Testament",
    books: [
      "genesis",
      "exodus",
      "leviticus",
      "numbers",
      "deuteronomy",
      "josue",
      "judges",
      "ruth",
      "1-kings",
      "2-kings",
      "3-kings",
      "4-kings",
      "1-paralipomenon",
      "2-paralipomenon",
      "1-esdras",
      "2-esdras",
      "tobias",
      "judith",
      "esther",
      "job",
      "psalms",
      "proverbs",
      "ecclesiastes",
      "canticle-of-canticles",
      "wisdom",
      "ecclesiasticus",
      "isaie",
      "jeremie",
      "lamentations",
      "baruch",
      "ezechiel",
      "daniel",
      "osee",
      "joel",
      "amos",
      "abdias",
      "jonas",
      "micheas",
      "nahum",
      "habacuc",
      "sophonias",
      "aggeus",
      "zacharias",
      "malachie",
      "1-machabees",
      "2-machabees",
    ],
  },
  {
    id: "new",
    label: "New Testament",
    books: [
      "matthew",
      "mark",
      "luke",
      "john",
      "acts",
      "romans",
      "1-corinthians",
      "2-corinthians",
      "galatians",
      "ephesians",
      "philippians",
      "colossians",
      "1-thessalonians",
      "2-thessalonians",
      "1-timothy",
      "2-timothy",
      "titus",
      "philemon",
      "hebrews",
      "james",
      "1-peter",
      "2-peter",
      "1-john",
      "2-john",
      "3-john",
      "jude",
      "apocalypse",
    ],
  },
  {
    id: "appendix",
    label: "Appendix",
    books: ["3-esdras", "4-esdras", "prayer-of-manasses"],
  },
];

const bookLabels = {
  "1-corinthians": "1 Corinthians",
  "1-esdras": "1 Esdras",
  "1-john": "1 John",
  "1-kings": "1 Kings",
  "1-machabees": "1 Machabees",
  "1-paralipomenon": "1 Paralipomenon",
  "1-peter": "1 Peter",
  "1-thessalonians": "1 Thessalonians",
  "1-timothy": "1 Timothy",
  "2-corinthians": "2 Corinthians",
  "2-esdras": "2 Esdras",
  "2-john": "2 John",
  "2-kings": "2 Kings",
  "2-machabees": "2 Machabees",
  "2-paralipomenon": "2 Paralipomenon",
  "2-peter": "2 Peter",
  "2-thessalonians": "2 Thessalonians",
  "2-timothy": "2 Timothy",
  "3-esdras": "3 Esdras",
  "3-john": "3 John",
  "3-kings": "3 Kings",
  "4-esdras": "4 Esdras",
  "4-kings": "4 Kings",
  "canticle-of-canticles": "Canticle of Canticles",
  "prayer-of-manasses": "Prayer of Manasses",
};

const allowedBibleTags = new Set(["alt", "br", "col-left", "col-right", "cr", "i", "mn", "na", "sc"]);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function decodeEntities(text) {
  return text
    .replace(/<br\s*\/?\s*>/gi, " — ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function labelFromSlug(slug) {
  if (bookLabels[slug]) return bookLabels[slug];
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function validateMarkup(value, context) {
  if (typeof value !== "string") return;
  for (const match of value.matchAll(/<\/?([a-z][a-z0-9-]*)\b[^>]*>/gi)) {
    if (!allowedBibleTags.has(match[1].toLowerCase())) {
      throw new Error(`${context}: unsupported markup tag <${match[1]}>`);
    }
  }
}

function validateBook(data, slug) {
  if (!Array.isArray(data.chapters) || data.chapters.length === 0) {
    throw new Error(`${slug}: expected at least one chapter`);
  }

  const chapterNumbers = data.chapters.map((chapter) => chapter.chapter);
  if (new Set(chapterNumbers).size !== chapterNumbers.length) {
    throw new Error(`${slug}: duplicate chapter numbers`);
  }

  for (const intro of data.intros ?? []) {
    validateMarkup(intro.title, `${slug}: introduction title`);
    validateMarkup(intro.text, `${slug}: introduction`);
    for (const note of intro.notes ?? []) validateMarkup(note.text, `${slug}: introduction note`);
  }

  for (const chapter of data.chapters) {
    if (!Array.isArray(chapter.verses) || chapter.verses.length === 0) {
      throw new Error(`${slug} ${chapter.chapter}: expected at least one verse`);
    }
    validateMarkup(chapter.summary, `${slug} ${chapter.chapter}: summary`);
    for (const note of chapter.summary_notes ?? []) {
      validateMarkup(note.text, `${slug} ${chapter.chapter}: summary note`);
    }
    for (const verse of chapter.verses) {
      validateMarkup(verse.text, `${slug} ${chapter.chapter}:${verse.verse}`);
      for (const note of verse.notes ?? []) {
        validateMarkup(note.text, `${slug} ${chapter.chapter}:${verse.verse} note`);
      }
    }
  }
}

function annotationChapters(slug) {
  const directory = join(annotationsDirectory, slug);
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((filename) => /^\d{3}\.json$/.test(filename))
    .map((filename) => Number.parseInt(filename, 10))
    .sort((left, right) => left - right);
}

function buildBooks() {
  const books = [];
  for (const group of groups) {
    for (const slug of group.books) {
      const path = join(taggedDirectory, `${slug}.json`);
      if (!existsSync(path)) throw new Error(`Missing Bible data for ${slug}`);
      const data = readJson(path);
      validateBook(data, slug);

      books.push({
        slug,
        title: data.short_title || labelFromSlug(slug),
        fullTitle: decodeEntities(data.book_title || data.book || labelFromSlug(slug)),
        testament: group.id,
        testamentLabel: group.label,
        chapters: data.chapters.length,
        hasIntroduction: Boolean(data.intros?.length),
        annotationChapters: annotationChapters(slug),
      });
    }
  }
  return books;
}

function buildReferenceCatalog() {
  const documents = [];
  for (const testament of ["ot", "nt"]) {
    const directory = join(referenceDirectory, testament);
    for (const filename of readdirSync(directory).filter((name) => name.endsWith(".json")).sort()) {
      const data = readJson(join(directory, filename));
      const slug = basename(filename, ".json");
      documents.push({
        id: `${testament}/${slug}`,
        path: `data/reference/${testament}/${filename}`,
        testament,
        testamentLabel: testament === "ot" ? "Old Testament edition" : "New Testament edition",
        title: decodeEntities(data.title || labelFromSlug(slug)),
      });
    }
  }
  return documents;
}

function recursiveFiles(directory) {
  return readdirSync(directory)
    .flatMap((name) => {
      const path = join(directory, name);
      return statSync(path).isDirectory() ? recursiveFiles(path) : [path];
    })
    .sort();
}

function repairAnnotationContinuations(outputAnnotationsDirectory, books) {
  let repairs = 0;
  for (const book of books) {
    const source = readJson(join(taggedDirectory, `${book.slug}.json`));
    const validVerses = new Map(
      source.chapters.map((chapter) => [
        Number(chapter.chapter),
        new Set(chapter.verses.map((verse) => Number(verse.verse))),
      ]),
    );

    for (const chapterNumber of book.annotationChapters) {
      const filename = `${String(chapterNumber).padStart(3, "0")}.json`;
      const path = join(outputAnnotationsDirectory, book.slug, filename);
      const data = readJson(path);
      const valid = validVerses.get(chapterNumber);
      const normalized = [];

      for (const annotation of data.annotations ?? []) {
        if (valid?.has(Number(annotation.verse))) {
          normalized.push(annotation);
          continue;
        }

        const previous = normalized.at(-1);
        if (!previous || annotation.title) {
          throw new Error(
            `${book.slug} ${chapterNumber}:${annotation.verse}: invalid annotation anchor cannot be repaired`,
          );
        }

        if (annotation.text) {
          previous.text = [previous.text, annotation.text].filter(Boolean).join("\n\n");
        }
        if (annotation.notes?.length) {
          previous.notes = [...(previous.notes ?? []), ...annotation.notes];
        }
        repairs += 1;
      }

      if (normalized.length !== data.annotations.length) {
        data.annotations = normalized;
        writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
      }
    }
  }
  return repairs;
}

function repairDuplicateVerses(outputBibleDirectory, books) {
  let repairs = 0;
  for (const book of books) {
    const path = join(outputBibleDirectory, `${book.slug}.json`);
    const data = readJson(path);
    let changed = false;

    for (const chapter of data.chapters) {
      const verses = [];
      const byNumber = new Map();
      for (const verse of chapter.verses) {
        const existing = byNumber.get(verse.verse);
        if (!existing) {
          byNumber.set(verse.verse, verse);
          verses.push(verse);
          continue;
        }

        existing.notes = [...(existing.notes ?? []), ...(verse.notes ?? [])];
        existing.cross_refs = [...(existing.cross_refs ?? []), ...(verse.cross_refs ?? [])];
        if (verse.has_annotation) existing.has_annotation = true;
        if (existing.notes.length === 0) delete existing.notes;
        if (existing.cross_refs.length === 0) delete existing.cross_refs;
        repairs += 1;
        changed = true;
      }
      chapter.verses = verses;
    }

    if (changed) writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  }
  return repairs;
}

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });
cpSync(publicDirectory, outputDirectory, { recursive: true });

const books = buildBooks();
const reference = buildReferenceCatalog();
const catalog = {
  name: "The Original Douay-Rheims Bible",
  edition: "Rheims 1582 · Douai 1609–1610",
  groups: groups.map(({ id, label }) => ({ id, label })),
  books,
  reference,
};

writeFileSync(join(outputDirectory, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);

mkdirSync(join(outputDirectory, "data"), { recursive: true });
cpSync(taggedDirectory, join(outputDirectory, "data", "bible"), { recursive: true });
cpSync(annotationsDirectory, join(outputDirectory, "data", "annotations"), { recursive: true });
cpSync(referenceDirectory, join(outputDirectory, "data", "reference"), { recursive: true });
const verseRepairs = repairDuplicateVerses(join(outputDirectory, "data", "bible"), books);
const annotationRepairs = repairAnnotationContinuations(
  join(outputDirectory, "data", "annotations"),
  books,
);

mkdirSync(join(outputDirectory, "downloads"), { recursive: true });
cpSync(rawDirectory, join(outputDirectory, "downloads", "raw"), { recursive: true });
cpSync(usfmDirectory, join(outputDirectory, "downloads", "usfm"), { recursive: true });

cpSync(join(outputDirectory, "index.html"), join(outputDirectory, "404.html"));

const hash = createHash("sha256");
for (const path of recursiveFiles(outputDirectory)) {
  if (extname(path) !== ".map" && basename(path) !== "sw.js") {
    hash.update(path.slice(outputDirectory.length));
    hash.update(readFileSync(path));
  }
}

const serviceWorkerPath = join(outputDirectory, "sw.js");
const serviceWorker = readFileSync(serviceWorkerPath, "utf8").replace(
  "__BUILD_HASH__",
  hash.digest("hex").slice(0, 12),
);
writeFileSync(serviceWorkerPath, serviceWorker);

const canonicalBooks = books.filter((book) => book.testament !== "appendix").length;
const chapters = books.reduce((total, book) => total + book.chapters, 0);
console.log(
  `Built ${canonicalBooks} canonical books, ${books.length - canonicalBooks} appendix texts, ${chapters} chapters, and ${reference.length} reference documents in dist/ (${verseRepairs} duplicate verse and ${annotationRepairs} continued annotations repaired).`,
);
