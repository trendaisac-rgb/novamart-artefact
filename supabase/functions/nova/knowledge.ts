/**
 * Policy knowledge: the catalog that goes into the system prompt, and keyword
 * search (BM25) over policy sections.
 *
 * Why BM25 and not embeddings: 8 documents, about 40 sections. Keyword scoring
 * is explainable (you can show why a section matched) and needs no extra
 * service. Each "##" section is one retrieval unit, so a rule is never cut in
 * half. When the corpus grows, keep the search() contract and put hybrid
 * retrieval (keyword + pgvector + metadata filters) behind it.
 */

export interface Section {
  doc_id: string;
  title: string;
  heading: string;
  body: string;
}

export interface Doc {
  doc_id: string;
  title: string;
  summary: string;
  sections: Section[];
}

export interface Hit {
  doc_id: string;
  heading: string;
  text: string;
  score: number;
}

/** Tiny plural stripper so "cards" matches "card" and "returns" matches "return". */
function stem(t: string): string {
  if (t.length > 3 && t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.length > 3 && t.endsWith("es") && "sxz".includes(t[t.length - 3]!)) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).map(stem);
}

const K1 = 1.5;
const B = 0.75;

export class KnowledgeBase {
  readonly sections: Section[];
  private terms: Map<string, number>[] = [];
  private lengths: number[] = [];
  private docFreq = new Map<string, number>();
  private avgLength = 0;

  constructor(readonly docs: Doc[]) {
    this.sections = docs.flatMap((d) => d.sections);
    for (const s of this.sections) {
      // Title and heading are indexed with the body; the heading counts twice,
      // so "holiday returns" also matches on the section name.
      const tokens = tokenize(`${s.title} ${s.heading} ${s.heading} ${s.body}`);
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.docFreq.set(t, (this.docFreq.get(t) ?? 0) + 1);
      this.terms.push(tf);
      this.lengths.push(tokens.length);
    }
    this.avgLength = this.lengths.reduce((a, b) => a + b, 0) / Math.max(1, this.lengths.length);
  }

  /** One line per document with its sections. This is everything that exists. */
  catalog(): string {
    return this.docs
      .map(
        (d) =>
          `- ${d.doc_id}: ${d.title}. ${d.summary} Sections: ${d.sections.map((s) => s.heading).join(", ")}.`,
      )
      .join("\n");
  }

  search(query: string, k = 5): Hit[] {
    const n = this.sections.length;
    const q = [...new Set(tokenize(query))];
    const scored = this.sections.map((s, i) => {
      let score = 0;
      for (const t of q) {
        const f = this.terms[i]!.get(t) ?? 0;
        if (!f) continue;
        const df = this.docFreq.get(t) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5)); // rare words count more
        score +=
          (idf * f * (K1 + 1)) / (f + K1 * (1 - B + (B * this.lengths[i]!) / this.avgLength));
      }
      return { s, score };
    });
    return scored
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(({ s, score }) => ({
        doc_id: s.doc_id,
        heading: s.heading,
        text: s.body,
        score: Math.round(score * 1000) / 1000,
      }));
  }
}
