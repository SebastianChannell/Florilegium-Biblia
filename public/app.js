import {
  adjacentLocation,
  findBook,
  locationLabel,
  normalizeLocation,
  pageUrl,
  parsePageLocation,
} from "./navigation.js";

const elements = {
  apparatusView: document.querySelector("#apparatus-view"),
  bookIntroduction: document.querySelector("#book-introduction"),
  bookIntroductionText: document.querySelector("#book-introduction-text"),
  bookSelect: document.querySelector("#book-select"),
  chapterFooterNav: document.querySelector(".chapter-footer-nav"),
  chapterLabel: document.querySelector("#chapter-label"),
  chapterNotes: document.querySelector("#chapter-notes"),
  chapterReader: document.querySelector("#chapter-reader"),
  chapterSelect: document.querySelector("#chapter-select"),
  chapterSummary: document.querySelector("#chapter-summary"),
  chapterSummaryNotes: document.querySelector("#chapter-summary-notes"),
  chapterSummaryText: document.querySelector("#chapter-summary-text"),
  chapterTitle: document.querySelector("#chapter-title"),
  closeDialog: document.querySelector("#close-dialog"),
  dialogContent: document.querySelector("#dialog-content"),
  dialogReference: document.querySelector("#dialog-reference"),
  downloadLinks: document.querySelector("#download-links"),
  nextChapter: document.querySelector("#next-chapter"),
  nextLink: document.querySelector("#next-link"),
  noteDialog: document.querySelector("#note-dialog"),
  noteLegend: document.querySelector("#note-legend"),
  notesList: document.querySelector("#notes-list"),
  previousChapter: document.querySelector("#previous-chapter"),
  previousLink: document.querySelector("#previous-link"),
  readerStatus: document.querySelector("#reader-status"),
  referenceLink: document.querySelector("#reference-link"),
  referenceReader: document.querySelector("#reference-reader"),
  referenceSelect: document.querySelector("#reference-select"),
  referenceStatus: document.querySelector("#reference-status"),
  scriptureLink: document.querySelector("#scripture-link"),
  scriptureView: document.querySelector("#scripture-view"),
  testamentLabel: document.querySelector("#testament-label"),
  verses: document.querySelector("#verses"),
};

const state = {
  catalog: null,
  view: "scripture",
  book: "genesis",
  chapter: 1,
  document: "",
  loadController: null,
};

const bookCache = new Map();
const annotationCache = new Map();
const referenceCache = new Map();

async function fetchJson(path, signal) {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`);
  return response.json();
}

function createOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function populateBookSelector() {
  const groups = state.catalog.groups.map((group) => {
    const optionGroup = document.createElement("optgroup");
    optionGroup.label = group.label;
    const books = state.catalog.books.filter((book) => book.testament === group.id);
    optionGroup.append(...books.map((book) => createOption(book.slug, book.title)));
    return optionGroup;
  });
  elements.bookSelect.replaceChildren(...groups);
}

function populateChapterSelector(book) {
  const noun = book.slug === "psalms" ? "Ps." : "Ch.";
  const options = Array.from({ length: book.chapters }, (_, index) =>
    createOption(String(index + 1), `${noun} ${index + 1}`),
  );
  elements.chapterSelect.replaceChildren(...options);
  elements.chapterSelect.value = String(state.chapter);
}

function populateReferenceSelector() {
  const groups = [
    { id: "ot", label: "Old Testament · 1609" },
    { id: "nt", label: "New Testament · 1582" },
  ].map(({ id, label }) => {
    const optionGroup = document.createElement("optgroup");
    optionGroup.label = label;
    const documents = state.catalog.reference.filter((document) => document.testament === id);
    optionGroup.append(...documents.map((document) => createOption(document.id, document.title)));
    return optionGroup;
  });
  elements.referenceSelect.replaceChildren(...groups);
}

function setActiveView(view) {
  state.view = view;
  const scripture = view === "scripture";
  elements.scriptureView.hidden = !scripture;
  elements.apparatusView.hidden = scripture;
  elements.scriptureLink.classList.toggle("is-active", scripture);
  elements.referenceLink.classList.toggle("is-active", !scripture);
  elements.scriptureLink.toggleAttribute("aria-current", scripture);
  elements.referenceLink.toggleAttribute("aria-current", !scripture);
  elements.scriptureLink.setAttribute("aria-current", scripture ? "page" : "false");
  elements.referenceLink.setAttribute("aria-current", scripture ? "false" : "page");
}

function appendSanitizedNode(source, target) {
  if (source.nodeType === Node.TEXT_NODE) {
    target.append(document.createTextNode(source.textContent ?? ""));
    return;
  }

  if (source.nodeType !== Node.ELEMENT_NODE) {
    for (const child of source.childNodes) appendSanitizedNode(child, target);
    return;
  }

  const tag = source.tagName.toLowerCase();
  if (tag === "cr") return;

  let element;
  if (tag === "i" || tag === "em" || tag === "alt") {
    element = document.createElement("em");
    if (tag === "alt") element.className = "alternate-reading";
  } else if (tag === "sc") {
    element = document.createElement("span");
    element.className = "small-caps";
  } else if (tag === "na") {
    element = document.createElement("sup");
    element.className = "original-marker";
  } else if (tag === "mn") {
    element = document.createElement("sup");
    element.className = "marginal-marker";
  } else if (tag === "br") {
    target.append(document.createElement("br"));
    return;
  } else if (tag === "strong" || tag === "b") {
    element = document.createElement("strong");
  } else if (tag === "span") {
    element = document.createElement("span");
  } else if (tag === "col-left" || tag === "col-right") {
    element = document.createElement("span");
    element.className = `annotation-column ${tag}`;
  } else {
    for (const child of source.childNodes) appendSanitizedNode(child, target);
    return;
  }

  for (const child of source.childNodes) appendSanitizedNode(child, element);
  target.append(element);
}

function taggedFragment(text = "") {
  const template = document.createElement("template");
  template.innerHTML = text;
  const fragment = document.createDocumentFragment();
  for (const child of template.content.childNodes) appendSanitizedNode(child, fragment);
  return fragment;
}

function taggedParagraphs(text = "", className = "tagged-paragraph") {
  const fragment = document.createDocumentFragment();
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const textPart of paragraphs) {
    const paragraph = document.createElement("p");
    paragraph.className = className;
    paragraph.append(taggedFragment(textPart.replace(/\n/g, " ")));
    fragment.append(paragraph);
  }
  return fragment;
}

function makeSubnotes(notes = []) {
  const list = document.createElement("div");
  list.className = "subnotes";

  for (const note of notes) {
    const row = document.createElement("div");
    row.className = "subnote";
    const marker = document.createElement("span");
    marker.className = "subnote-marker";
    marker.textContent = `[${note.marker ?? note.label ?? "•"}]`;
    const text = document.createElement("div");
    text.append(taggedParagraphs(note.text ?? ""));
    row.append(marker, text);
    list.append(row);
  }

  return list;
}

function makeAnnotationBlock(annotation) {
  const block = document.createElement("section");
  block.className = "apparatus-block";

  const label = document.createElement("p");
  label.className = "apparatus-label";
  label.textContent = "Annotation";
  block.append(label);

  if (annotation.title) {
    const title = document.createElement("h3");
    title.className = "annotation-title";
    title.append(taggedFragment(annotation.title));
    block.append(title);
  }

  if (annotation.text) {
    const text = document.createElement("div");
    text.className = "apparatus-text";
    text.append(taggedParagraphs(annotation.text));
    block.append(text);
  }

  if (annotation.notes?.length) block.append(makeSubnotes(annotation.notes));
  return block;
}

function makeTranslatorNotesBlock(notes) {
  const block = document.createElement("section");
  block.className = "apparatus-block";
  const label = document.createElement("p");
  label.className = "apparatus-label";
  label.textContent = notes.length === 1 ? "Translator note" : "Translator notes";
  block.append(label);

  for (const note of notes) {
    const title = document.createElement("h3");
    title.className = "annotation-title";
    title.textContent = `Note ${note.label ? `(${note.label})` : ""}`.trim();
    const text = document.createElement("div");
    text.className = "apparatus-text";
    text.append(taggedParagraphs(note.text ?? ""));
    block.append(title, text);
  }
  return block;
}

function makeApparatusFragment(notes, annotations, preferred = "annotation") {
  const fragment = document.createDocumentFragment();
  const annotationBlocks = annotations.map(makeAnnotationBlock);
  const noteBlock = notes.length ? makeTranslatorNotesBlock(notes) : null;

  if (preferred === "note") {
    if (noteBlock) fragment.append(noteBlock);
    fragment.append(...annotationBlocks);
  } else {
    fragment.append(...annotationBlocks);
    if (noteBlock) fragment.append(noteBlock);
  }
  return fragment;
}

function openApparatus(book, chapter, verse, notes, annotations, preferred) {
  elements.dialogReference.textContent = `${book.title} ${chapter}:${verse}`;
  elements.dialogContent.replaceChildren(makeApparatusFragment(notes, annotations, preferred));
  if (typeof elements.noteDialog.showModal === "function") {
    elements.noteDialog.showModal();
  } else {
    elements.noteDialog.setAttribute("open", "");
  }
}

function closeApparatus() {
  if (typeof elements.noteDialog.close === "function") elements.noteDialog.close();
  else elements.noteDialog.removeAttribute("open");
}

function makeNoteButton(kind, book, chapter, verse, notes, annotations) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `note-action${kind === "annotation" ? " is-annotation" : ""}`;
  const count = kind === "annotation" ? annotations.length : notes.length;
  const noun = kind === "annotation" ? "annotation" : "note";
  button.textContent = count > 1 ? `${count} ${noun}s` : noun;
  button.setAttribute("aria-label", `Open ${button.textContent} for ${book.title} ${chapter}:${verse}`);
  button.addEventListener("click", () =>
    openApparatus(book, chapter, verse, notes, annotations, kind),
  );
  return button;
}

function annotationsByVerse(annotationData) {
  const entries = new Map();
  for (const annotation of annotationData?.annotations ?? []) {
    const existing = entries.get(annotation.verse) ?? [];
    existing.push(annotation);
    entries.set(annotation.verse, existing);
  }
  return entries;
}

function renderBookIntroduction(bookData) {
  const intros = bookData.intros ?? [];
  elements.bookIntroduction.hidden = intros.length === 0;
  elements.bookIntroduction.open = false;
  if (intros.length === 0) {
    elements.bookIntroductionText.replaceChildren();
    return;
  }

  const sections = intros.map((intro) => {
    const section = document.createElement("section");
    section.className = "intro-section";
    if (intro.title) {
      const heading = document.createElement("h2");
      heading.append(taggedFragment(intro.title));
      section.append(heading);
    }
    if (intro.text) section.append(taggedParagraphs(intro.text));
    if (intro.notes?.length) section.append(makeSubnotes(intro.notes));
    return section;
  });
  elements.bookIntroductionText.replaceChildren(...sections);
}

function renderChapterSummary(chapter) {
  const hasSummary = Boolean(chapter.summary?.trim());
  elements.chapterSummary.hidden = !hasSummary;
  elements.chapterSummaryText.replaceChildren();
  elements.chapterSummaryNotes.replaceChildren();
  elements.chapterSummaryNotes.hidden = true;
  if (!hasSummary) return;

  elements.chapterSummaryText.append(taggedParagraphs(chapter.summary));
  if (chapter.summary_notes?.length) {
    elements.chapterSummaryNotes.hidden = false;
    const notes = chapter.summary_notes.map((note) => {
      const row = document.createElement("div");
      row.className = "summary-note";
      const marker = document.createElement("span");
      marker.className = "summary-note-marker";
      marker.textContent = `[${note.marker ?? "•"}]`;
      const text = document.createElement("span");
      text.append(taggedFragment(note.text ?? ""));
      row.append(marker, text);
      return row;
    });
    elements.chapterSummaryNotes.append(...notes);
  }
}

function renderVerses(book, chapter, annotationData) {
  const annotationMap = annotationsByVerse(annotationData);
  const verseNodes = [];
  const noteCards = [];
  let hasApparatus = false;

  for (const verse of chapter.verses) {
    const notes = verse.notes ?? [];
    const annotations = annotationMap.get(verse.verse) ?? [];
    const hasNotes = notes.length > 0;
    const hasAnnotations = annotations.length > 0;
    hasApparatus ||= hasNotes || hasAnnotations;

    const row = document.createElement("p");
    row.className = "verse";
    row.id = `verse-${verse.verse}`;

    const number = document.createElement("span");
    number.className = "verse-number";
    number.textContent = String(verse.verse);
    number.setAttribute("aria-hidden", "true");

    const body = document.createElement("span");
    body.className = "verse-body";
    body.append(taggedFragment(verse.text));

    if (hasNotes || hasAnnotations) {
      const actions = document.createElement("span");
      actions.className = "verse-actions";
      if (hasNotes) {
        actions.append(
          makeNoteButton("note", book, chapter.chapter, verse.verse, notes, annotations),
        );
      }
      if (hasAnnotations) {
        actions.append(
          makeNoteButton("annotation", book, chapter.chapter, verse.verse, notes, annotations),
        );
      }
      body.append(actions);

      const card = document.createElement("details");
      card.className = "note-card";
      card.id = `notes-verse-${verse.verse}`;
      const summary = document.createElement("summary");
      const reference = document.createElement("span");
      reference.className = "note-card-reference";
      reference.textContent = `Verse ${verse.verse}`;
      const kinds = document.createElement("span");
      kinds.className = "note-kinds";
      if (hasNotes) {
        const mark = document.createElement("i");
        mark.className = "note-kind";
        mark.title = "Translator note";
        kinds.append(mark);
      }
      if (hasAnnotations) {
        const mark = document.createElement("i");
        mark.className = "note-kind is-annotation";
        mark.title = "Annotation";
        kinds.append(mark);
      }
      summary.append(reference, kinds);
      const content = document.createElement("div");
      content.className = "note-card-body";
      content.append(makeApparatusFragment(notes, annotations));
      card.append(summary, content);
      noteCards.push(card);
    }

    row.append(number, body);
    verseNodes.push(row);
  }

  elements.verses.replaceChildren(...verseNodes);
  elements.noteLegend.hidden = !hasApparatus;
  elements.chapterNotes.hidden = !hasApparatus;
  elements.notesList.replaceChildren(...noteCards);
}

function renderDownloads(book) {
  const links = [
    { label: "Tagged JSON", href: `./data/bible/${book.slug}.json` },
    { label: "Plain JSON", href: `./downloads/raw/${book.slug}.json` },
    { label: "USFM", href: `./downloads/usfm/${book.slug}.usfm` },
  ].map(({ label, href }) => {
    const link = document.createElement("a");
    link.href = href;
    link.download = "";
    link.textContent = label;
    return link;
  });
  elements.downloadLinks.replaceChildren(...links);
}

function configureAdjacentLinks(location) {
  const previous = adjacentLocation(state.catalog, location, -1);
  const next = adjacentLocation(state.catalog, location, 1);
  elements.previousChapter.disabled = !previous;
  elements.nextChapter.disabled = !next;
  elements.previousLink.hidden = !previous;
  elements.nextLink.hidden = !next;
  elements.chapterFooterNav.hidden = !previous && !next;

  if (previous) {
    elements.previousLink.href = pageUrl(previous);
    elements.previousLink.querySelector("strong").textContent = locationLabel(state.catalog, previous);
  }
  if (next) {
    elements.nextLink.href = pageUrl(next);
    elements.nextLink.querySelector("strong").textContent = locationLabel(state.catalog, next);
  }
}

async function getBookData(slug) {
  if (!bookCache.has(slug)) {
    bookCache.set(slug, fetchJson(`./data/bible/${slug}.json`));
  }
  try {
    return await bookCache.get(slug);
  } catch (error) {
    bookCache.delete(slug);
    throw error;
  }
}

async function getAnnotationData(book, chapter) {
  if (!book.annotationChapters.includes(chapter)) return { annotations: [] };
  const key = `${book.slug}/${chapter}`;
  if (!annotationCache.has(key)) {
    const filename = String(chapter).padStart(3, "0");
    annotationCache.set(
      key,
      fetchJson(`./data/annotations/${book.slug}/${filename}.json`),
    );
  }
  try {
    return await annotationCache.get(key);
  } catch (error) {
    annotationCache.delete(key);
    throw error;
  }
}

async function loadScripture(location, { scroll = false } = {}) {
  const normalized = normalizeLocation(state.catalog, location);
  const book = findBook(state.catalog, normalized.book);
  state.book = normalized.book;
  state.chapter = normalized.chapter;
  setActiveView("scripture");

  elements.bookSelect.value = state.book;
  populateChapterSelector(book);
  elements.chapterSelect.value = String(state.chapter);
  elements.readerStatus.hidden = false;
  elements.readerStatus.textContent = "Loading Scripture…";
  elements.chapterReader.hidden = true;

  state.loadController?.abort();
  const controller = new AbortController();
  state.loadController = controller;

  try {
    const [bookData, annotationData] = await Promise.all([
      getBookData(book.slug),
      getAnnotationData(book, state.chapter),
    ]);
    if (controller.signal.aborted) return;

    const chapter = bookData.chapters.find((entry) => Number(entry.chapter) === state.chapter);
    if (!chapter) throw new Error(`${book.title} does not contain chapter ${state.chapter}.`);

    elements.testamentLabel.textContent = book.testamentLabel;
    elements.chapterTitle.textContent = book.title;
    elements.chapterLabel.textContent = `${book.slug === "psalms" ? "Psalm" : "Chapter"} ${state.chapter}`;
    renderBookIntroduction(bookData);
    renderChapterSummary(chapter);
    renderVerses(book, chapter, annotationData);
    renderDownloads(book);
    configureAdjacentLinks(normalized);

    elements.readerStatus.hidden = true;
    elements.chapterReader.hidden = false;
    document.title = `${book.title} ${state.chapter} — Biblia`;
    localStorage.setItem("biblia-last-location", JSON.stringify(normalized));
    if (scroll) elements.scriptureView.scrollIntoView({ block: "start" });
  } catch (error) {
    if (error.name === "AbortError") return;
    elements.readerStatus.hidden = false;
    elements.readerStatus.textContent = "The chapter could not be opened. Please try again.";
    console.error(error);
  }
}

function humanizeKey(key) {
  return key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function appendReferenceString(container, value, className = "reference-paragraph") {
  if (!value?.trim()) return;
  container.append(taggedParagraphs(value, className));
}

const referenceMetadataKeys = new Set(["section", "title", "subtitle"]);
const referenceHeadingKeys = new Set(["heading", "book", "letter"]);
const referenceCollectionKeys = new Set([
  "articles",
  "books",
  "entries",
  "paragraphs",
  "sections",
  "subsections",
  "words",
]);

function renderReferenceValue(value, key = "", depth = 0) {
  const fragment = document.createDocumentFragment();
  if (value === null || value === undefined || value === "") return fragment;

  if (typeof value === "string" || typeof value === "number") {
    const paragraph = document.createElement("p");
    paragraph.className = "reference-paragraph";
    if (key && !referenceCollectionKeys.has(key)) {
      const term = document.createElement("span");
      term.className = "reference-term";
      term.textContent = `${humanizeKey(key)} · `;
      paragraph.append(term);
    }
    paragraph.append(taggedFragment(String(value)));
    fragment.append(paragraph);
    return fragment;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" || typeof item === "number") {
        fragment.append(renderReferenceValue(item, "", depth));
      } else {
        const entry = document.createElement("section");
        entry.className = depth > 1 ? "reference-entry" : "reference-section";
        entry.append(renderReferenceValue(item, "", depth + 1));
        fragment.append(entry);
      }
    }
    return fragment;
  }

  const headingKey = [...referenceHeadingKeys].find((candidate) => value[candidate]);
  const termValue = value.term ?? value.word ?? value.name ?? null;
  if (headingKey) {
    const heading = document.createElement(depth < 2 ? "h2" : "h3");
    heading.append(taggedFragment(String(value[headingKey])));
    fragment.append(heading);
  } else if (termValue) {
    const term = document.createElement("p");
    term.className = "reference-term";
    term.append(taggedFragment(String(termValue)));
    fragment.append(term);
  } else if (value.number !== undefined && value.text) {
    const term = document.createElement("p");
    term.className = "reference-term";
    term.textContent = `Article ${value.number}`;
    fragment.append(term);
  }

  if (value.text) appendReferenceString(fragment, value.text);
  if (value.notes?.length) fragment.append(makeSubnotes(value.notes));

  const consumed = new Set([
    headingKey,
    "term",
    "word",
    "name",
    "number",
    "text",
    "notes",
  ]);

  for (const [childKey, childValue] of Object.entries(value)) {
    if (consumed.has(childKey) || referenceMetadataKeys.has(childKey)) continue;
    if (childValue === null || childValue === undefined || childValue === "") continue;

    if (
      (Array.isArray(childValue) || typeof childValue === "object") &&
      !referenceCollectionKeys.has(childKey)
    ) {
      const heading = document.createElement(depth < 2 ? "h2" : "h3");
      heading.textContent = humanizeKey(childKey);
      fragment.append(heading);
    }
    fragment.append(renderReferenceValue(childValue, childKey, depth + 1));
  }

  return fragment;
}

function renderReferenceDocument(documentData) {
  const title = document.createElement("h1");
  title.append(taggedFragment(documentData.title ?? "Reference document"));
  const nodes = [title];

  if (documentData.subtitle) {
    const subtitle = document.createElement("div");
    subtitle.className = "reference-subtitle";
    subtitle.append(taggedFragment(documentData.subtitle));
    nodes.push(subtitle);
  }

  const content = document.createElement("div");
  const remaining = Object.fromEntries(
    Object.entries(documentData).filter(([key]) => !referenceMetadataKeys.has(key)),
  );
  content.append(renderReferenceValue(remaining));
  nodes.push(content);
  elements.referenceReader.replaceChildren(...nodes);
}

async function loadReference(documentId, { scroll = false } = {}) {
  const fallback =
    state.catalog.reference.find((document) => document.id === "ot/title-page") ??
    state.catalog.reference[0];
  const documentEntry =
    state.catalog.reference.find((document) => document.id === documentId) ?? fallback;
  state.document = documentEntry.id;
  setActiveView("apparatus");
  elements.referenceSelect.value = documentEntry.id;
  elements.referenceStatus.hidden = false;
  elements.referenceStatus.textContent = "Loading the original apparatus…";
  elements.referenceReader.hidden = true;

  state.loadController?.abort();
  const controller = new AbortController();
  state.loadController = controller;

  try {
    if (!referenceCache.has(documentEntry.id)) {
      referenceCache.set(documentEntry.id, fetchJson(`./${documentEntry.path}`));
    }
    const data = await referenceCache.get(documentEntry.id);
    if (controller.signal.aborted) return;
    renderReferenceDocument(data);
    elements.referenceStatus.hidden = true;
    elements.referenceReader.hidden = false;
    document.title = `${documentEntry.title} — Biblia`;
    if (scroll) elements.apparatusView.scrollIntoView({ block: "start" });
  } catch (error) {
    if (error.name === "AbortError") return;
    referenceCache.delete(documentEntry.id);
    elements.referenceStatus.textContent = "This document could not be opened. Please try again.";
    console.error(error);
  }
}

function replaceOrPush(url, replace) {
  history[replace ? "replaceState" : "pushState"]({}, "", url);
}

function goToScripture(location, { replace = false, scroll = true } = {}) {
  const normalized = normalizeLocation(state.catalog, location);
  replaceOrPush(pageUrl(normalized), replace);
  return loadScripture(normalized, { scroll });
}

function goToReference(documentId, { replace = false, scroll = true } = {}) {
  const document =
    state.catalog.reference.find((entry) => entry.id === documentId) ??
    state.catalog.reference.find((entry) => entry.id === "ot/title-page") ??
    state.catalog.reference[0];
  replaceOrPush(pageUrl({ view: "apparatus", document: document.id }), replace);
  return loadReference(document.id, { scroll });
}

function lastLocation() {
  try {
    return JSON.parse(localStorage.getItem("biblia-last-location") ?? "null");
  } catch {
    return null;
  }
}

async function syncFromUrl({ replace = false, scroll = false } = {}) {
  const requested = parsePageLocation(window.location.href, state.catalog);
  if (requested.view === "apparatus") {
    await goToReference(requested.document, { replace, scroll });
  } else {
    const parameters = new URL(window.location.href).searchParams;
    const saved = !parameters.has("book") && !parameters.has("chapter") ? lastLocation() : null;
    await goToScripture(saved ?? requested, { replace, scroll });
  }
}

function bindEvents() {
  elements.bookSelect.addEventListener("change", () =>
    goToScripture({ book: elements.bookSelect.value, chapter: 1 }),
  );
  elements.chapterSelect.addEventListener("change", () =>
    goToScripture({ book: state.book, chapter: elements.chapterSelect.value }),
  );
  elements.previousChapter.addEventListener("click", () => {
    const previous = adjacentLocation(state.catalog, state, -1);
    if (previous) goToScripture(previous);
  });
  elements.nextChapter.addEventListener("click", () => {
    const next = adjacentLocation(state.catalog, state, 1);
    if (next) goToScripture(next);
  });
  elements.previousLink.addEventListener("click", (event) => {
    event.preventDefault();
    const previous = adjacentLocation(state.catalog, state, -1);
    if (previous) goToScripture(previous);
  });
  elements.nextLink.addEventListener("click", (event) => {
    event.preventDefault();
    const next = adjacentLocation(state.catalog, state, 1);
    if (next) goToScripture(next);
  });
  elements.scriptureLink.addEventListener("click", (event) => {
    event.preventDefault();
    goToScripture({ book: state.book, chapter: state.chapter });
  });
  elements.referenceLink.addEventListener("click", (event) => {
    event.preventDefault();
    goToReference(state.document);
  });
  elements.referenceSelect.addEventListener("change", () =>
    goToReference(elements.referenceSelect.value),
  );
  elements.closeDialog.addEventListener("click", closeApparatus);
  elements.noteDialog.addEventListener("click", (event) => {
    if (event.target === elements.noteDialog) closeApparatus();
  });
  window.addEventListener("popstate", () => syncFromUrl({ scroll: true }));
}

async function initialize() {
  try {
    state.catalog = await fetchJson("./catalog.json");
    populateBookSelector();
    populateReferenceSelector();
    bindEvents();
    await syncFromUrl({ replace: true });
  } catch (error) {
    elements.readerStatus.textContent = "The Bible library could not be opened. Please refresh and try again.";
    console.error(error);
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
  }
}

initialize();
