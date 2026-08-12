export function findBook(catalog, slug) {
  return catalog.books.find((book) => book.slug === slug) ?? null;
}

export function normalizeLocation(catalog, location = {}) {
  const fallback = findBook(catalog, "genesis") ?? catalog.books[0];
  const book = findBook(catalog, location.book) ?? fallback;
  const requestedChapter = Number.parseInt(location.chapter, 10);
  const chapter = Number.isInteger(requestedChapter)
    ? Math.min(Math.max(requestedChapter, 1), book.chapters)
    : 1;

  return { book: book.slug, chapter };
}

export function adjacentLocation(catalog, location, direction) {
  const current = normalizeLocation(catalog, location);
  const index = catalog.books.findIndex((book) => book.slug === current.book);
  const book = catalog.books[index];

  if (direction < 0) {
    if (current.chapter > 1) return { book: current.book, chapter: current.chapter - 1 };
    if (index === 0) return null;
    const previous = catalog.books[index - 1];
    return { book: previous.slug, chapter: previous.chapters };
  }

  if (current.chapter < book.chapters) return { book: current.book, chapter: current.chapter + 1 };
  if (index === catalog.books.length - 1) return null;
  return { book: catalog.books[index + 1].slug, chapter: 1 };
}

export function parsePageLocation(url, catalog) {
  const parameters = new URL(url, "https://example.test/").searchParams;
  const view = parameters.get("view") === "apparatus" ? "apparatus" : "scripture";
  const location = normalizeLocation(catalog, {
    book: parameters.get("book"),
    chapter: parameters.get("chapter"),
  });

  return {
    view,
    ...location,
    document: parameters.get("document") ?? "",
  };
}

export function pageUrl({ view = "scripture", book, chapter, document = "" } = {}) {
  const parameters = new URLSearchParams();
  if (view === "apparatus") {
    parameters.set("view", "apparatus");
    if (document) parameters.set("document", document);
  } else {
    if (book && book !== "genesis") parameters.set("book", book);
    if (chapter && Number(chapter) !== 1) parameters.set("chapter", String(chapter));
  }

  const query = parameters.toString();
  return query ? `?${query}` : "./";
}

export function locationLabel(catalog, location) {
  const normalized = normalizeLocation(catalog, location);
  const book = findBook(catalog, normalized.book);
  return `${book.title} ${normalized.chapter}`;
}
