# Florilegium Biblia

A quiet, mobile-first reader for the original pre-Challoner Douay-Rheims Bible
of 1582–1610. The reader keeps the sacred text visually primary while making
the original translators' notes and fuller annotations easy to recognize and
open.

## Reader features

- The complete 73-book Catholic canon, followed by 3 Esdras, 4 Esdras, and the
  Prayer of Manasses in an appendix.
- A compact native book and chapter selector designed to work especially well
  on iPhone.
- Distinct note and annotation markers wherever apparatus is available.
- A tap-friendly reading sheet for each verse's notes and annotations.
- A complete notes-and-annotations section after every chapter.
- Book introductions, chapter summaries, and the original 1582/1609 title
  pages, prefaces, approbations, glossaries, and doctrinal tables.
- Download links for each book in tagged JSON, plain JSON, and USFM.
- Shareable chapter URLs, last-location memory, and an installable offline app
  shell that caches chapters as they are read.
- The established Sacrum Florilegium palette and typography: near-black
  `#070606`, purple `#8451CF`, restrained gold, and a generous serif reading
  measure.

Cross-references remain in the source data and downloads, but are intentionally
omitted from the reading interface so the original notes and annotations have
greater prominence.

## Build and verify

Requires Node.js 20 or newer. There are no runtime or build dependencies.

```sh
npm run check
npm run dev
```

The production site is written to `dist/`. For Cloudflare Pages, use
`npm run build` as the build command and `dist` as the output directory.

The build validates the book order and text markup, generates the complete
catalog, copies the reader data and download formats, and safely rejoins a few
page-continuation fragments that were assigned impossible verse numbers in the
upstream extraction. The imported source files themselves remain unchanged.

## Source dataset

The complete text of the Original Douay-Rheims Bible (Old Testament 1609, New
Testament 1582) in structured JSON, with footnotes, cross-references,
annotations, and reference documents.

This is the unmodified historic translation — not the 18th-century Challoner
revision — rendered faithfully from the original printed volumes.

**License:** [CC0 1.0 Universal](LICENSE) — public domain. Use freely, no
attribution required.

---

## Contents

| Path | Description |
|------|-------------|
| `bible/tagged/` | Bible text with all original markup (`<sc>`, `<i>`, `<na>`, `<mn>`, `<cr>`) — 73 books |
| `bible/raw/` | Bible text as plain prose — all markup and markers stripped |
| `annotations/` | Chapter-level annotation sidecars (commentary, extended notes) |
| `usfm/` | USFM files — one per book, footnotes embedded inline |
| `reference/ot/` | Old Testament front matter (preface, tables, glossary, etc.) |
| `reference/nt/` | New Testament front matter (preface, tables, glossary, etc.) |

---

## Bible JSON format

Each file in `bible/tagged/` and `bible/raw/` represents one book.

```json
{
  "book": "genesis",
  "book_title": "The Book of Genesis",
  "short_title": "Genesis",
  "chapters": [
    {
      "chapter": 1,
      "verses": [
        {
          "verse": 6,
          "text": "God also said: Be a firmament made amidst the waters.",
          "notes": [
            { "label": "a", "text": "The firmament is all the space from the earth..." }
          ]
        }
      ]
    }
  ]
}
```

### Markup tags (`bible/tagged/` only)

| Tag | Meaning |
|-----|---------|
| `<sc>Word</sc>` | Small caps — proper nouns and significant passages |
| `<i>word</i>` | Italic — words supplied by the translators, absent from the Latin |

`bible/raw/` strips all tags. `bible/tagged/` preserves everything including
footnote anchors (`<na>`), marginal note numbers (`<mn>`), and cross-reference
markers (`<cr>`). Note content is always in the verse's `notes[]` array regardless
of version.

---

## Annotations format

Files in `annotations/{book}/{chapter}.json` contain verse-level commentary and
extended notes. Chapters without annotations have no file.

```json
{
  "book": "genesis",
  "chapter": 1,
  "annotations": [
    {
      "verse": 1,
      "title": "Annotation title",
      "text": "Commentary text.",
      "notes": [
        { "marker": "a", "text": "Sub-note text." }
      ]
    }
  ]
}
```

---

## USFM format

Files in `usfm/` follow the Unified Standard Format Markers (USFM 3) spec.
Typographic markup is converted to USFM character styles:

| ODR tag | USFM marker |
|---------|-------------|
| `<sc>Word</sc>` | `\sc Word\sc*` |
| `<i>word</i>` | `\add word\add*` |

Footnotes are embedded inline using `\f + \fr {ch}:{v} \ft {text}\f*`.

Cross-references are embedded inline using `\x + \xo {ch}:{v} \xt {text}\x*`. The reference text uses original ODR abbreviations (e.g. `Io. 8, 12.` = John 8:12).

---

## Reference documents

Files in `reference/ot/` and `reference/nt/` contain the front matter from
the original printed volumes: prefaces to the reader, tables of contents,
glossaries, historical tables, doctrinal essays, and other apparatus.

Most files have a `paragraphs` array of `{ "text": "..." }` objects. Some have
`subsections`, `entries`, or `articles` arrays — see `SCHEMA.md` for the full
structure of each document type.

---

## Books included

The 73 books of the Catholic canon, including the deuterocanonical books
(Tobit, Judith, 1 & 2 Maccabees, Wisdom, Sirach, Baruch).

---

## Related

- [Source dataset](https://github.com/janvier-s/original-douay-rheims)
- [The Original Douay-Rheims](https://thedouayrheims.com)
