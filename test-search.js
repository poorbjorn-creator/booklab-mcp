import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const books = JSON.parse(readFileSync(join(__dirname, "data/book-profiles.json"), "utf-8"));

// Copy search logic from server.js for testing
function buildCorpus(book) {
  return [book.title, book.author, ...book.themes, ...book.tags, ...book.bestFor, ...(book.notFor || []), book.keyInsight, book.bjornSays, book.worldview || "", book.emotionalTone || "", ...(book.connections || []).map(c => `${c.book} ${c.relationship}`)].join(" ").toLowerCase();
}
const STOP = new Set(["the","a","an","is","are","was","were","be","been","being","have","has","had","do","does","did","will","would","could","should","may","might","shall","can","to","of","in","for","on","with","at","by","from","as","into","through","during","before","after","above","below","between","but","and","or","nor","not","so","yet","both","either","neither","each","every","all","any","few","more","most","other","some","such","no","only","own","same","than","too","very","just","about","it","its","this","that","these","those","i","me","my","we","our","you","your","he","him","his","she","her","they","them","their","what","which","who","whom","how","when","where","why"]);
function tokenize(text) { return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)); }
const CONCEPT_MAP = { meaning: ["purpose","existential","fulfillment","meaning","why"], depression: ["sadness","loss","grief","disconnection","mental","despair"], happiness: ["joy","wellbeing","fulfillment","flourishing","flow","satisfaction"], philosophy: ["existentialism","stoicism","ethics","morality","wisdom","philosophical"], psychology: ["mind","behavior","cognitive","emotional","mental","psychological"], death: ["mortality","dying","death","grief","loss","finite"], suffering: ["pain","trauma","adversity","hardship","struggle","resilience"], society: ["civilization","culture","collective","social","political","community"], technology: ["tech","digital","ai","innovation","disruption","future"], freedom: ["liberty","autonomy","independence","individualism","free"], money: ["economics","wealth","financial","capitalism","bitcoin"] };
function expandQuery(tokens) { const expanded = new Set(tokens); for (const token of tokens) { for (const [concept, synonyms] of Object.entries(CONCEPT_MAP)) { if (token === concept || synonyms.includes(token)) { expanded.add(concept); for (const s of synonyms) expanded.add(s); } } } return [...expanded]; }
const corpusTexts = books.map(buildCorpus);
const corpusTokens = corpusTexts.map(tokenize);
const docCount = books.length;
const df = {};
for (const tokens of corpusTokens) { const unique = new Set(tokens); for (const t of unique) df[t] = (df[t] || 0) + 1; }
function idf(term) { return Math.log((docCount + 1) / ((df[term] || 0) + 1)) + 1; }
function scoreBook(queryTokens, bookIndex) {
  const bookTokenSet = corpusTokens[bookIndex]; const bookTf = {};
  for (const t of bookTokenSet) bookTf[t] = (bookTf[t] || 0) + 1;
  const maxTf = Math.max(...Object.values(bookTf), 1);
  let score = 0;
  for (const qt of queryTokens) { if (bookTf[qt]) { const tf = 0.5 + 0.5 * (bookTf[qt] / maxTf); score += tf * idf(qt); } for (const bt of Object.keys(bookTf)) { if (bt !== qt && (bt.startsWith(qt) || qt.startsWith(bt)) && Math.abs(bt.length - qt.length) <= 3) { score += 0.3 * idf(bt); } } }
  if (books[bookIndex].rating === 5) score *= 1.1;
  return score;
}
function searchBooks(query, topN = 3) { const tokens = tokenize(query); const expanded = expandQuery(tokens); const results = books.map((book, i) => ({ title: book.title, score: scoreBook(expanded, i) })); return results.filter(b => b.score > 0).sort((a, b) => b.score - a.score).slice(0, topN); }

// Test queries
const queries = [
  "I feel lost and need to find meaning in life",
  "How does society shape human behavior?",
  "I want to understand death and mortality",
  "Books about building good habits and productivity",
  "Understanding economics and Bitcoin",
  "I'm going through depression and disconnection",
];

for (const q of queries) {
  console.log(`\n🔍 "${q}"`);
  const results = searchBooks(q);
  for (const r of results) console.log(`   ${r.score.toFixed(2)} — ${r.title}`);
  if (results.length === 0) console.log("   (no matches)");
}
