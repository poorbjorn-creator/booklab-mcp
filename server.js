#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const books = JSON.parse(readFileSync(join(__dirname, "data/book-profiles.json"), "utf-8"));

// --- Semantic search engine (TF-IDF inspired, zero dependencies) ---

// Build searchable text corpus per book
function buildCorpus(book) {
  return [
    book.title,
    book.author,
    ...book.themes,
    ...book.tags,
    ...book.bestFor,
    ...(book.notFor || []),
    book.keyInsight,
    book.bjornSays,
    book.worldview || "",
    book.emotionalTone || "",
    ...(book.connections || []).map(c => `${c.book} ${c.relationship}`),
  ].join(" ").toLowerCase();
}

// Tokenize: split, remove short/stop words
const STOP = new Set(["the","a","an","is","are","was","were","be","been","being","have","has","had","do","does","did","will","would","could","should","may","might","shall","can","to","of","in","for","on","with","at","by","from","as","into","through","during","before","after","above","below","between","but","and","or","nor","not","so","yet","both","either","neither","each","every","all","any","few","more","most","other","some","such","no","only","own","same","than","too","very","just","about","it","its","this","that","these","those","i","me","my","we","our","you","your","he","him","his","she","her","they","them","their","what","which","who","whom","how","when","where","why"]);

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
}

// Synonym/concept expansion for common queries
const CONCEPT_MAP = {
  meaning: ["purpose", "existential", "fulfillment", "meaning", "why"],
  depression: ["sadness", "loss", "grief", "disconnection", "mental", "despair"],
  anxiety: ["fear", "stress", "worry", "uncertainty", "overwhelm"],
  leadership: ["influence", "power", "authority", "management", "leading"],
  happiness: ["joy", "wellbeing", "fulfillment", "flourishing", "flow", "satisfaction"],
  relationships: ["love", "connection", "empathy", "social", "belonging"],
  productivity: ["focus", "discipline", "habits", "work", "deep", "efficiency"],
  philosophy: ["existentialism", "stoicism", "ethics", "morality", "wisdom", "philosophical"],
  psychology: ["mind", "behavior", "cognitive", "emotional", "mental", "psychological"],
  history: ["civilization", "historical", "war", "society", "humanity", "evolution"],
  death: ["mortality", "dying", "death", "grief", "loss", "finite"],
  freedom: ["liberty", "autonomy", "independence", "individualism", "free"],
  society: ["civilization", "culture", "collective", "social", "political", "community"],
  money: ["economics", "wealth", "financial", "capitalism", "bitcoin"],
  technology: ["tech", "digital", "ai", "innovation", "disruption", "future"],
  suffering: ["pain", "trauma", "adversity", "hardship", "struggle", "resilience"],
  identity: ["self", "ego", "personality", "individuality", "authenticity"],
};

function expandQuery(tokens) {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    for (const [concept, synonyms] of Object.entries(CONCEPT_MAP)) {
      if (token === concept || synonyms.includes(token)) {
        expanded.add(concept);
        for (const s of synonyms) expanded.add(s);
      }
    }
  }
  return [...expanded];
}

// Build IDF from corpus
const corpusTexts = books.map(buildCorpus);
const corpusTokens = corpusTexts.map(tokenize);
const docCount = books.length;
const df = {};
for (const tokens of corpusTokens) {
  const unique = new Set(tokens);
  for (const t of unique) df[t] = (df[t] || 0) + 1;
}
function idf(term) {
  return Math.log((docCount + 1) / ((df[term] || 0) + 1)) + 1;
}

// Score a query against a book
function scoreBook(queryTokens, bookIndex) {
  const bookTokenSet = corpusTokens[bookIndex];
  const bookTf = {};
  for (const t of bookTokenSet) bookTf[t] = (bookTf[t] || 0) + 1;
  const maxTf = Math.max(...Object.values(bookTf), 1);

  let score = 0;
  for (const qt of queryTokens) {
    if (bookTf[qt]) {
      const tf = 0.5 + 0.5 * (bookTf[qt] / maxTf);
      score += tf * idf(qt);
    }
    // Partial match bonus (prefix)
    for (const bt of Object.keys(bookTf)) {
      if (bt !== qt && (bt.startsWith(qt) || qt.startsWith(bt)) && Math.abs(bt.length - qt.length) <= 3) {
        score += 0.3 * idf(bt);
      }
    }
  }
  // Boost 5-star books
  if (books[bookIndex].rating === 5) score *= 1.1;
  return score;
}

function searchBooks(query, topN = 5) {
  const tokens = tokenize(query);
  const expanded = expandQuery(tokens);
  const results = books.map((book, i) => ({ ...book, score: scoreBook(expanded, i) }));
  return results.filter(b => b.score > 0).sort((a, b) => b.score - a.score).slice(0, topN);
}

// --- MCP Server ---

const server = new McpServer({
  name: "booklab",
  version: "0.2.0",
});

// Tool: recommend books based on a situation or question
server.tool(
  "recommend",
  "Get nonfiction book recommendations from BookLab's curated library. Describe a situation, question, or topic — get ranked recommendations with reasoning.",
  { query: z.string().describe("What the reader needs — a problem, question, topic, or mood"), count: z.number().optional().describe("Number of recommendations (default 3, max 5)") },
  async ({ query, count }) => {
    const n = Math.min(count || 3, 5);
    const results = searchBooks(query, n);

    if (results.length === 0) {
      return {
        content: [{ type: "text", text: `No strong matches in BookLab's library for "${query}". Try describing what you're going through or what you want to learn. Library has ${books.length} curated nonfiction titles.` }],
      };
    }

    const text = results
      .map((b, i) => `${i + 1}. **${b.title}** by ${b.author} (${b.rating}/5)\n   _${b.bjornSays}_\n   Key insight: ${b.keyInsight}\n   Themes: ${b.themes.join(", ")}\n   Best for: ${b.bestFor.join(", ")}`)
      .join("\n\n");

    return { content: [{ type: "text", text: `BookLab recommends (from ${books.length} curated nonfiction books):\n\n${text}` }] };
  }
);

// Tool: get detailed profile of a specific book
server.tool(
  "book_profile",
  "Get the full structured profile of a specific book from BookLab's library.",
  { title: z.string().describe("Book title (partial match OK)") },
  async ({ title }) => {
    const t = title.toLowerCase();
    const book = books.find((b) => b.title.toLowerCase().includes(t) || b.id.includes(t.replace(/\s+/g, "-")));
    if (!book) {
      return { content: [{ type: "text", text: `Book not found: "${title}". Available: ${books.map((b) => b.title).join(", ")}` }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(book, null, 2) }] };
  }
);

// Tool: list all books
server.tool(
  "list_books",
  "List all books in BookLab's curated nonfiction library.",
  {},
  async () => {
    const text = books
      .map((b) => `• ${b.title} — ${b.author} (${b.rating}/5) [${b.tags.join(", ")}]`)
      .join("\n");
    return { content: [{ type: "text", text: `BookLab Library (${books.length} books):\n\n${text}` }] };
  }
);

// Resource: expose the full library as a resource
server.resource("library", "booklab://library", async (uri) => ({
  contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(books, null, 2) }],
}));

const transport = new StdioServerTransport();
await server.connect(transport);
