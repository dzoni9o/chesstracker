import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type {
  TournamentListItem,
  TournamentDetail,
  RoundData,
  Pairing,
  PlayerCard,
  PlayerResult,
} from "./types";

const BASE = "https://chess-results.com";
const TIMEOUT = 12_000;

// HTTP helper

interface FetchHtmlResult {
  html: string;
  url: string;
}

async function fetchHtmlResponse(url: string, init: RequestInit = {}): Promise<FetchHtmlResult> {
  const headers = new Headers(init.headers);
  if (!headers.has("User-Agent")) {
    headers.set("User-Agent", "Mozilla/5.0 (compatible; ChessTracker/1.0)");
  }

  const res = await fetch(url, {
    ...init,
    headers,
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error("HTTP " + res.status + " -> " + url);
  return { html: await res.text(), url: res.url };
}

async function fetchHtml(url: string, init: RequestInit = {}): Promise<string> {
  const { html } = await fetchHtmlResponse(url, init);
  return html;
}

function parseElo(s: string): number {
  const n = parseInt(s?.trim() || "0", 10);
  return isNaN(n) ? 0 : n;
}

function parsePoints(s: string): number | null {
  if (!s?.trim()) return null;
  const clean = s.trim().replace(",", ".").replace("½", ".5");
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

function parseResult(s: string): string | null {
  const r = s?.trim() ?? "";
  if (r === "1 - 0" || r === "1-0") return "1-0";
  if (r === "0 - 1" || r === "0-1") return "0-1";
  if (r === "½ - ½" || r === "½-½" || r === "1/2-1/2") return "½-½";
  if (r === "+" || r === "bye" || r === "BYE") return "+";
  if (r === "-") return "-";
  return null;
}

function parsePlayerResult(s: string): "1" | "0" | "½" | "+" | "-" | null {
  const r = s?.trim() ?? "";
  if (r === "1") return "1";
  if (r === "0") return "0";
  if (r === "½" || r === "0.5") return "½";
  if (r === "+") return "+";
  if (r === "-") return "-";
  return null;
}

function extractTnrId(href: string): string | null {
  const m = href.match(/tnr(\d+)/i);
  return m ? m[1] : null;
}
function normalizeDate(input?: string): string {
  if (!input) return "";
  const value = input.trim();
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return value;
  const slashed = value.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (slashed) return slashed[1] + "-" + slashed[2] + "-" + slashed[3];
  const compact = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return compact[1] + "-" + compact[2] + "-" + compact[3];
  const dotted = value.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
  if (dotted) {
    return dotted[3] + "-" + dotted[2].padStart(2, "0") + "-" + dotted[1].padStart(2, "0");
  }
  return "";
}

function normalizeChessResultsDate(input?: string): string {
  const value = input?.trim() || "";
  const ymd = value.match(/^(20\d{2})[.\/-](\d{1,2})[.\/-](\d{1,2})$/);
  if (ymd) {
    return ymd[1] + "-" + ymd[2].padStart(2, "0") + "-" + ymd[3].padStart(2, "0");
  }

  return normalizeDate(value);
}

function extractDateFromText(text: string): string {
  const dotted = text.match(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2})\b/);
  if (dotted) {
    return dotted[3] + "-" + dotted[2].padStart(2, "0") + "-" + dotted[1].padStart(2, "0");
  }

  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    return iso[1] + "-" + iso[2].padStart(2, "0") + "-" + iso[3].padStart(2, "0");
  }

  return "";
}

function dateInRange(date: string, from?: string, to?: string): boolean {
  const fromDate = normalizeDate(from);
  const toDate = normalizeDate(to);
  if (!date) return !fromDate && !toDate;
  if (fromDate && date < fromDate) return false;
  if (toDate && date > toDate) return false;
  return true;
}

function hiddenValue($: cheerio.CheerioAPI, name: string): string {
  return $("input[name=\"" + name + "\"]").attr("value") || "";
}

function buildWebFormsParams($: cheerio.CheerioAPI): URLSearchParams {
  const params = new URLSearchParams();

  $("input[name]").each((_, el) => {
    const input = $(el);
    const name = input.attr("name");
    if (!name) return;

    const type = (input.attr("type") || "text").toLowerCase();
    if (["button", "checkbox", "file", "image", "radio", "reset", "submit"].includes(type)) return;
    params.set(name, input.attr("value") || "");
  });

  $("select[name]").each((_, el) => {
    const select = $(el);
    const name = select.attr("name");
    if (!name || params.has(name)) return;
    const selected = select.find("option[selected]").first().attr("value");
    const first = select.find("option").first().attr("value");
    params.set(name, selected ?? first ?? "");
  });

  return params;
}

async function fetchFederationHtml(fed: string, selection: string): Promise<string> {
  const url = BASE + "/fed.aspx?lan=1&fed=" + fed;
  if (!selection || selection === "0") return fetchHtml(url);

  const initialHtml = await fetchHtml(url);
  const $ = cheerio.load(initialHtml);
  const body = new URLSearchParams({
    __EVENTTARGET: "combo_sel",
    __EVENTARGUMENT: "",
    __VIEWSTATE: hiddenValue($, "__VIEWSTATE"),
    __VIEWSTATEGENERATOR: hiddenValue($, "__VIEWSTATEGENERATOR"),
    __EVENTVALIDATION: hiddenValue($, "__EVENTVALIDATION"),
    combo_tur_sel: selection,
    combo_sort: "0",
  });

  return fetchHtml(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

async function fetchTournamentDatabaseHtml(fed: string, from?: string, to?: string): Promise<string> {
  const initial = await fetchHtmlResponse(BASE + "/turniersuche.aspx?lan=1&SNode=S0");
  const $ = cheerio.load(initial.html);
  const body = buildWebFormsParams($);
  const fromDate = normalizeDate(from);
  const toDate = normalizeDate(to);

  body.set("__EVENTTARGET", "");
  body.set("__EVENTARGUMENT", "");
  body.set("ctl00$P1$combo_land", fed);
  body.set("ctl00$P1$txt_von_tag", fromDate);
  body.set("ctl00$P1$txt_bis_tag", toDate);
  body.set("ctl00$P1$combo_art", "5");
  body.set("ctl00$P1$combo_sort", "4");
  body.set("ctl00$P1$combo_bedenkzeit", "0");
  body.set("ctl00$P1$combo_anzahl_zeilen", "5");
  body.set("ctl00$P1$cb_suchen", "Search");

  return fetchHtml(initial.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: initial.url,
    },
    body,
  });
}

function parseTournamentDatabaseRows($: cheerio.CheerioAPI, fed: string): TournamentListItem[] {
  const tournaments: TournamentListItem[] = [];
  const seen = new Set<string>();

  $("a[href*='tnr']").each((_, el) => {
    const href = $(el).attr("href") || "";
    const id = extractTnrId(href);
    if (!id || seen.has(id)) return;

    const row = $(el).closest("tr");
    const cells = row.find("td");
    if (cells.length < 19) return;

    const name = $(el).text().trim();
    if (!name || name.length < 4) return;

    const cellText = (index: number) => $(cells[index]).text().replace(/\s+/g, " ").trim();
    const dateFrom = normalizeChessResultsDate(cellText(5));
    const dateTo = normalizeChessResultsDate(cellText(6));
    if (!dateFrom && !dateTo) return;

    seen.add(id);
    tournaments.push({
      id,
      name,
      dateFrom,
      dateTo,
      city: cellText(12),
      country: cellText(2) || fed,
      rounds: parseInt(cellText(16), 10) || 0,
      players: parseInt(cellText(17), 10) || 0,
    });
  });

  return tournaments;
}

export async function scrapeTournamentList(
  fed: string,
  from?: string,
  to?: string,
  selection = "0"
): Promise<TournamentListItem[]> {
  const hasDateFilter = Boolean(normalizeDate(from) || normalizeDate(to));

  if (hasDateFilter) {
    const html = await fetchTournamentDatabaseHtml(fed, from, to);
    const $ = cheerio.load(html);
    return parseTournamentDatabaseRows($, fed);
  }

  const html = await fetchFederationHtml(fed, selection || "0");
  const $ = cheerio.load(html);
  const tournaments: TournamentListItem[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const id = extractTnrId(href);
    if (!id || seen.has(id)) return;

    const text = $(el).text().trim();
    if (!text || text.length < 4) return;
    if (href.includes("art=") || href.includes("fed.aspx") || href.includes("Default.aspx")) return;

    const row = $(el).closest("tr");
    const cells = row.find("td");
    let dateFrom = "";
    let dateTo = "";
    let city = "";
    let rounds = 0;
    let players = 0;

    cells.each((i, td) => {
      const val = $(td).text().trim();
      if (/^\d{2}\.\d{2}\.\d{4}$/.test(val) && !dateFrom) {
        dateFrom = val.split(".").reverse().join("-");
      } else if (/^\d{2}\.\d{2}\.\d{4}$/.test(val) && dateFrom) {
        dateTo = val.split(".").reverse().join("-");
      } else if (/^\d+$/.test(val) && !rounds && parseInt(val) > 0 && parseInt(val) < 30) {
        rounds = parseInt(val);
      } else if (/^\d+$/.test(val) && rounds && parseInt(val) > 4) {
        players = parseInt(val);
      } else if (!city && val.length > 2 && !/^\d/.test(val) && val !== text) {
        city = val;
      }
    });

    const inferredDate = dateFrom || extractDateFromText(text);
    if (!dateInRange(inferredDate, from, to)) return;

    seen.add(id);
    tournaments.push({
      id,
      name: text,
      dateFrom: inferredDate,
      dateTo,
      city,
      country: fed,
      rounds,
      players,
    });
  });

  return tournaments.slice(0, 50);
}

export async function scrapeTournamentDetail(
  tnr: string,
  fed: string
): Promise<TournamentDetail> {
  const url = `${BASE}/tnr${tnr}.aspx?lan=1&art=2&fed=${fed}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  // Ime turnira je u <title> ili u prvoj Ã„â€¡eliji info tabele
  let name = $("title").text().replace("Chess-Results Server Chess-results.com -", "").trim();

  // Zadnja runda: traÃ…Â¾imo "***Rd.N***" ili bold rd link
  let currentRound = 0;
  let totalRounds = 0;

  const boardPairText = $("td").filter((_, el) => $(el).text().includes("Board Pairings")).first().next().text();
  const rdMatches = boardPairText.matchAll(/Rd\.(\d+)/g);
  const allRds = [...rdMatches].map(m => parseInt(m[1]));
  totalRounds = allRds.length > 0 ? Math.max(...allRds) : 0;

  // Kurzivni/bold oznaÃ„Âava aktuelnu rundu (npr. "Rd.4/7")
  const currentMatch = boardPairText.match(/Rd\.(\d+)\/(\d+)/);
  if (currentMatch) {
    currentRound = parseInt(currentMatch[1]);
    totalRounds = parseInt(currentMatch[2]);
  } else if (allRds.length > 0) {
    currentRound = Math.max(...allRds);
  }

  // Last update
  let lastUpdate = "";
  const updateMatch = $("body").text().match(/Last update ([\d.]+\s+[\d:]+)/);
  if (updateMatch) lastUpdate = updateMatch[1];

  // Datum izvuci iz info tabele
  let dateFrom = "";
  let dateTo = "";
  let city = "";
  let organizer = "";
  
  $("td").each((_, el) => {
    const txt = $(el).text().trim();
    const dateMatch = txt.match(/(\d{2})\.(\d{2})\.(\d{4})\s*[-Ã¢â‚¬â€œ]\s*(\d{2})\.(\d{2})\.(\d{4})/);
    if (dateMatch && !dateFrom) {
      dateFrom = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
      dateTo = `${dateMatch[6]}-${dateMatch[5]}-${dateMatch[4]}`;
    }
    if (txt.includes("Creator") && !organizer) {
      const m = txt.match(/Creator\/Last Upload:\s*(.+)/);
      if (m) organizer = m[1].trim();
    }
  });

  return {
    id: tnr,
    name,
    dateFrom,
    dateTo,
    city,
    country: fed,
    rounds: totalRounds,
    currentRound,
    lastUpdate,
    organizer,
  };
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ 3. Parovi za kolo Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
//
//  URL: https://chess-results.com/tnrXXX.aspx?lan=1&art=2&rd=N&fed=SRB
//  Tabela ima kolone: Bo. | No. | (title) | White | Rtg | Pts. | Result | Pts. | (title) | Black | Rtg | No.

export async function scrapeRound(
  tnr: string,
  round: number,
  fed: string
): Promise<RoundData> {
  const url = `${BASE}/tnr${tnr}.aspx?lan=1&art=2&rd=${round}&fed=${fed}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const name = $("title").text().replace("Chess-Results Server Chess-results.com -", "").trim();

  // Ukupno kola
  const boardPairCells = $("td").filter((_, el) => $(el).text().trim() === "Board Pairings");
  let totalRounds = round;
  const pairingLinks = boardPairCells.first().next().find("a");
  pairingLinks.each((_, el) => {
    const m = $(el).text().match(/Rd\.(\d+)/);
    if (m) totalRounds = Math.max(totalRounds, parseInt(m[1]));
  });
  const slashMatch = boardPairCells.first().next().text().match(/\/(\d+)/);
  if (slashMatch) totalRounds = parseInt(slashMatch[1]);

  // Datum kola
  let date = "";
  const dateMatch = $("body").text().match(/Round \d+ on ([\d/]+)/);
  if (dateMatch) date = dateMatch[1];

  // Parovi su u tabeli sa "Bo." kao prvom Ã„â€¡elijom u headeru
  const pairings: Pairing[] = [];

  // NaÃ„â€˜i pravu tabelu: ona Ã„Âiji header sadrÃ…Â¾i "Bo."
  let targetTable: Element | null = null;
  $("table").each((_, tbl) => {
    const headers = $(tbl).find("tr").first().find("td, th").map((_, td) => $(td).text().trim()).get();
    if (headers.some(h => h === "Bo.") && headers.some(h => h === "White" || h === "Rtg")) {
      targetTable = tbl;
      return false; // break
    }
  });

  if (!targetTable) {
    // fallback: pokuÃ…Â¡aj da parsujemo sve redove koji izgledaju kao parovi
    $("tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 8) return;
      const first = $(cells[0]).text().trim();
      if (!/^\d+$/.test(first)) return;
      parsePairingRow($, cells, pairings);
    });
  } else {
    // Skip header row, parsiraj ostale
    $(targetTable).find("tr").slice(1).each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 8) return;
      const first = $(cells[0]).text().trim();
      if (!/^\d+$/.test(first)) return;
      parsePairingRow($, cells, pairings);
    });
  }

  return {
    tournamentId: tnr,
    tournamentName: name,
    round,
    totalRounds,
    date,
    pairings,
  };
}

function parsePairingRow(
  $: ReturnType<typeof cheerio.load>,
  cells: ReturnType<typeof cheerio.load>["fn"] extends never ? never : ReturnType<ReturnType<typeof cheerio.load>>,
  pairings: Pairing[]
): void {
  // Kolone: Bo. | No. | (title) | White | Rtg | Pts. | Result | Pts. | (title) | Black | Rtg | No.
  //          0     1      2        3      4      5       6       7       8         9      10    11
  try {
    const board     = parseInt($(cells[0]).text().trim()) || 0;
    const whiteNo   = parseInt($(cells[1]).text().trim()) || 0;
    const whiteTitle= $(cells[2]).text().trim();
    const whiteName = $(cells[3]).text().trim();
    const whiteElo  = parseElo($(cells[4]).text());
    const whitePts  = parsePoints($(cells[5]).text());
    const result    = parseResult($(cells[6]).text());
    const blackPts  = parsePoints($(cells[7]).text());

    // Title i Black mogu biti u col 8 i 9, ili direktno 8 i 9 bez title
    let blackTitleIdx = 8, blackNameIdx = 9, blackEloIdx = 10, blackNoIdx = 11;
    // Provjera: ako col[8] izgleda kao naslov (kratak, bez razmaka)
    const col8 = $(cells[8])?.text().trim() ?? "";
    if (!col8 || col8.length <= 4) {
      // Jeste title kolona
    } else {
      // Nema title kolone, pomjeri
      blackTitleIdx = -1;
      blackNameIdx = 8;
      blackEloIdx = 9;
      blackNoIdx = 10;
    }

    const blackTitle= blackTitleIdx >= 0 ? ($(cells[blackTitleIdx])?.text().trim() ?? "") : "";
    const blackName = $(cells[blackNameIdx])?.text().trim() ?? "";
    const blackElo  = parseElo($(cells[blackEloIdx])?.text() ?? "");
    const blackNo   = parseInt($(cells[blackNoIdx])?.text().trim() ?? "0") || 0;

    if (!whiteName && !blackName) return;

    pairings.push({
      board,
      whiteNo,
      whiteName,
      whiteTitle,
      whiteElo,
      whiteFed: "",
      whitePoints: whitePts,
      result,
      blackNo,
      blackName,
      blackTitle,
      blackElo,
      blackFed: "",
      blackPoints: blackPts,
    });
  } catch {
    // Skip malformed rows
  }
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ 4. Kartica igraÃ„Âa Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
//
//  URL: https://chess-results.com/tnrXXX.aspx?lan=1&art=9&fed=SRB&snr=N
//  Tabela: Rd. | Bo. | SNo | (title) | Name | Rtg | FED | Pts. | Res.

export async function scrapePlayerCard(
  tnr: string,
  snr: string,
  fed: string
): Promise<PlayerCard> {
  const url = `${BASE}/tnr${tnr}.aspx?lan=1&art=9&fed=${fed}&snr=${snr}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const tournamentName = $("title").text().replace("Chess-Results Server Chess-results.com -", "").trim();

  // Player info tabela
  let name = "", title = "", playerFed = "", elo = 0, eloNat = 0, eloIntl = 0;
  let performanceRating: number | null = null, points = 0, rank = 0;

  $("table").each((_, tbl) => {
    const text = $(tbl).text();
    if (!text.includes("Performance rating") && !text.includes("Starting rank")) return;
    
    $(tbl).find("tr").each((_, row) => {
      const cells = $(row).find("td");
      const label = $(cells[0]).text().trim().toLowerCase();
      const value = $(cells[1]).text().trim();

      if (label.includes("name"))              name = value;
      if (label.includes("starting rank"))     {} // snr je veÃ„â€¡ poznat
      if (label.includes("title"))             title = value;
      if (label === "rating")                  elo = parseElo(value);
      if (label.includes("national"))          eloNat = parseElo(value);
      if (label.includes("international"))     eloIntl = parseElo(value);
      if (label.includes("performance"))       performanceRating = parseElo(value) || null;
      if (label.includes("points"))            points = parsePoints(value) ?? 0;
      if (label.includes("rank"))              rank = parseInt(value) || 0;
      if (label.includes("federation"))        playerFed = value;
    });
    return false; // Break after first matching table
  });

  // Fallback: pokuÃ…Â¡aj da naÃ„â€˜eÃ…Â¡ ime iz heading-a stranice
  if (!name) {
    const h2 = $("h2, h3").first().text().trim();
    if (h2) name = h2;
  }

  // Results tabela
  const results: PlayerResult[] = [];

  $("table").each((_, tbl) => {
    const headers = $(tbl).find("tr").first().find("td").map((_, td) => $(td).text().trim()).get();
    // TraÃ…Â¾imo tabelu sa Rd. | Bo. | SNo | Name | Rtg | FED | Pts. | Res.
    if (!headers.some(h => h === "Rd.") || !headers.some(h => h === "Res.")) return;

    $(tbl).find("tr").slice(1).each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 7) return;

      const rdText = $(cells[0]).text().trim();
      const rd = parseInt(rdText);
      if (!rd) return;

      const board = parseInt($(cells[1]).text().trim()) || 0;
      const oppNo = parseInt($(cells[2]).text().trim()) || 0;

      // Kolona 3 moÃ…Â¾e biti title (kratka) ili direktno ime
      let titleIdx = 3, nameIdx = 4, rtgIdx = 5, fedIdx = 6, ptsIdx = 7, resIdx = 8;
      const col3 = $(cells[3]).text().trim();
      if (col3.length > 6 && !["GM","IM","FM","CM","WGM","WIM","WFM","WCM","AFM","AGM"].includes(col3)) {
        // Col3 nije title
        titleIdx = -1; nameIdx = 3; rtgIdx = 4; fedIdx = 5; ptsIdx = 6; resIdx = 7;
      }

      const oppTitle  = titleIdx >= 0 ? $(cells[titleIdx]).text().trim() : "";
      const oppName   = $(cells[nameIdx])?.find("a").text() || $(cells[nameIdx])?.text().trim() || "";
      const oppElo    = parseElo($(cells[rtgIdx])?.text() ?? "");
      const oppFed    = $(cells[fedIdx])?.text().trim() ?? "";
      const oppPoints = parsePoints($(cells[ptsIdx])?.text() ?? "");
      const resRaw    = $(cells[resIdx])?.text().trim() ?? "";
      const result    = parsePlayerResult(resRaw);
      const color: "white" | "black" = resIdx < cells.length ? "white" : "white"; // TODO

      results.push({
        round: rd,
        board,
        color, // biÃ„â€¡e odreÃ„â€˜eno iz parova
        oppNo,
        oppName,
        oppTitle,
        oppElo,
        oppFed,
        oppPoints,
        result,
      });
    });

    return false;
  });

  return {
    tournamentId: tnr,
    tournamentName,
    snr: parseInt(snr),
    name: name || `IgraÃ„Â #${snr}`,
    title,
    fed: playerFed || fed,
    elo,
    eloNational: eloNat,
    eloIntl,
    performanceRating,
    points,
    rank,
    results,
  };
}




