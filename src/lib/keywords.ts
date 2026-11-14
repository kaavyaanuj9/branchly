// Turn a hypothesis sentence into a short keyword query for paper search engines, which match
// terms rather than meaning ("Venetoclax-resistant AML cells depend on GPX4 to avoid ferroptosis"
// -> "Venetoclax-resistant AML GPX4 ferroptosis").

const STOP = new Set(
  `a an the and or but if then so to of in on at by for with without from into onto than as is are was were be been being
  do does did not no nor can could may might will would should must shall this that these those it its their there here
  which who whom whose what when where why how such both each either neither more most less least very also only just
  via per vs versus among between within across through during after before because while whereas whether
  cells cell show shows showing increased decreased higher lower greater reduced enhance enhances enhanced depend depends
  dependent rather leads lead cause causes caused driven drives drive avoid avoids using use used make makes rely relies`
    .split(/\s+/)
    .filter(Boolean),
);

/** Up to `max` informative words, most specific first (gene names, numbers, hyphenated terms). */
export function keywordQuery(text: string, max = 6): string {
  const words = text
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^-+|-+$/g, ""))
    .filter((w) => w.length > 1 && !STOP.has(w.toLowerCase()));
  const seen = new Set<string>();
  const unique = words.filter((w) => !seen.has(w.toLowerCase()) && seen.add(w.toLowerCase()));
  // specific terms (GPX4, BCL-2, CD8+, venetoclax-resistant) beat ordinary words
  const score = (w: string) => (/[A-Z].*[A-Z0-9]|\d/.test(w) ? 3 : w.includes("-") ? 2 : w.length > 7 ? 1 : 0);
  const keep = new Set(
    [...unique]
      .map((w, i) => ({ w, i, s: score(w) }))
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .slice(0, max)
      .map((x) => x.w),
  );
  return unique.filter((w) => keep.has(w)).join(" "); // keep the sentence's word order
}
