import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type {
  TournamentListItem,
  TournamentDetail,
  RoundData,
  Pairing,
  PlayerCard,
  PlayerResult,
  PlayerTournamentItem,
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

  const boardPairText = $("td").filter((_, el) => $(el).text().includes("Board Pairings")).first().parent().text();
  const rdMatches = boardPairText.matchAll(/Rd\.(\d+)/g);
  const allRds = [...rdMatches].map(m => parseInt(m[1], 10));
  const bodyRoundMatches = [...$("body").text().matchAll(/Round\s+(\d+)\s+on/g)].map(m => parseInt(m[1], 10));
  const everyRound = [...allRds, ...bodyRoundMatches].filter(Boolean);
  totalRounds = everyRound.length > 0 ? Math.max(...everyRound) : 0;

  // Kurzivni/bold oznaÃ„Âava aktuelnu rundu (npr. "Rd.4/7")
  const currentMatch = boardPairText.match(/Rd\.(\d+)\/(\d+)/);
  if (currentMatch) {
    currentRound = parseInt(currentMatch[1]);
    totalRounds = parseInt(currentMatch[2]);
  } else if (allRds.length > 0) {
    currentRound = Math.max(...allRds);
  } else if (totalRounds > 0) {
    currentRound = totalRounds;
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
  const url = BASE + "/tnr" + tnr + ".aspx?lan=1&art=2&rd=" + round + "&fed=" + fed;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const name = $("title").text().replace("Chess-Results Server Chess-results.com -", "").trim();

  const boardPairText = $("td")
    .filter((_, el) => $(el).text().includes("Board Pairings"))
    .first()
    .parent()
    .text();
  let totalRounds = round;
  for (const match of boardPairText.matchAll(/Rd\.(\d+)/g)) {
    totalRounds = Math.max(totalRounds, parseInt(match[1], 10));
  }
  const slashMatch = boardPairText.match(/\/(\d+)/);
  if (slashMatch) totalRounds = parseInt(slashMatch[1], 10);

  let date = "";
  const dateMatch = $("body").text().match(/Round \d+ on ([\d/]+)/);
  if (dateMatch) date = dateMatch[1];

  const target = findPairingTable($);
  const pairings: Pairing[] = [];

  if (target) {
    for (let i = target.headerIndex + 1; i < target.rows.length; i++) {
      const cells = $(target.rows[i]).children("td, th");
      if (cells.length < 8) continue;
      const first = cellText($, cells, 0);
      if (!/^\d+$/.test(first)) continue;
      parsePairingRow($, target.headers, cells, pairings);
    }
  } else {
    $("tr").each((_, row) => {
      const cells = $(row).children("td, th");
      if (cells.length < 8) return;
      const first = cellText($, cells, 0);
      if (!/^\d+$/.test(first)) return;
      parsePairingRow($, [], cells, pairings);
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

interface PairingTableMatch {
  rows: Element[];
  headerIndex: number;
  headers: string[];
}

function findPairingTable($: cheerio.CheerioAPI): PairingTableMatch | null {
  let best: PairingTableMatch | null = null;

  $("table").each((_, table) => {
    const directRows = $(table).children("tbody").children("tr").add($(table).children("tr")).toArray();
    const rows = directRows.length > 0 ? directRows : $(table).find("tr").toArray();

    rows.forEach((row, headerIndex) => {
      const headers = $(row).children("td, th").map((_, cell) => $(cell).text().replace(/\s+/g, " ").trim()).get();
      if (!isPairingHeader(headers)) return;

      const candidate = { rows, headerIndex, headers };
      if (!best || rows.length < best.rows.length) best = candidate;
    });
  });

  return best;
}

function isPairingHeader(headers: string[]): boolean {
  return findHeader(headers, "bo") >= 0
    && findHeader(headers, "white") >= 0
    && findHeader(headers, "result") >= 0
    && findHeader(headers, "black") >= 0;
}

function normalizeHeaderLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

function findHeader(headers: string[], wanted: "bo" | "white" | "black" | "result"): number {
  return headers.findIndex((header) => {
    const h = normalizeHeaderLabel(header);
    if (wanted === "bo") return h === "bo" || h === "board" || h === "brett";
    if (wanted === "white") return h === "white" || h === "weiss" || h === "wit";
    if (wanted === "black") return h === "black" || h === "schwarz" || h === "zwart";
    return h === "result" || h === "res" || h === "erg";
  });
}

function findHeaderAfter(headers: string[], wanted: string, afterIndex: number): number {
  return headers.findIndex((header, index) => index > afterIndex && normalizeHeaderLabel(header) === wanted);
}

function findLastHeaderAfter(headers: string[], wanted: string, afterIndex: number): number {
  let found = -1;
  headers.forEach((header, index) => {
    if (index > afterIndex && normalizeHeaderLabel(header) === wanted) found = index;
  });
  return found;
}

function cellText($: cheerio.CheerioAPI, cells: cheerio.Cheerio<Element>, index: number): string {
  if (index < 0 || index >= cells.length) return "";
  return $(cells[index]).text().replace(/\s+/g, " ").trim();
}

function parsePairingRow(
  $: cheerio.CheerioAPI,
  headers: string[],
  cells: cheerio.Cheerio<Element>,
  pairings: Pairing[]
): void {
  try {
    const boardIdx = findHeader(headers, "bo");
    const whiteIdx = findHeader(headers, "white");
    const resultIdx = findHeader(headers, "result");
    const blackIdx = findHeader(headers, "black");

    const board = parseInt(cellText($, cells, boardIdx >= 0 ? boardIdx : 0), 10) || 0;
    const whiteNoIdx = headers.length ? findHeaderAfter(headers, "no", boardIdx) : 1;
    const whiteRtgIdx = headers.length ? findHeaderAfter(headers, "rtg", whiteIdx) : 4;
    const whitePtsIdx = headers.length ? findHeaderAfter(headers, "pts", whiteIdx) : 5;
    const blackPtsIdx = headers.length ? findHeaderAfter(headers, "pts", resultIdx) : 7;
    const blackRtgIdx = headers.length ? findHeaderAfter(headers, "rtg", blackIdx) : 10;
    const blackNoIdx = headers.length ? findLastHeaderAfter(headers, "no", blackIdx) : 11;

    const resolvedWhiteIdx = whiteIdx >= 0 ? whiteIdx : 3;
    const resolvedResultIdx = resultIdx >= 0 ? resultIdx : 6;
    const resolvedBlackIdx = blackIdx >= 0 ? blackIdx : 9;
    const whiteTitleIdx = resolvedWhiteIdx > 0 ? resolvedWhiteIdx - 1 : -1;
    const blackTitleIdx = resolvedBlackIdx > 0 ? resolvedBlackIdx - 1 : -1;

    const whiteName = cellText($, cells, resolvedWhiteIdx);
    const blackName = cellText($, cells, resolvedBlackIdx);
    if (!whiteName && !blackName) return;

    pairings.push({
      board,
      whiteNo: parseInt(cellText($, cells, whiteNoIdx), 10) || 0,
      whiteName,
      whiteTitle: cellText($, cells, whiteTitleIdx),
      whiteElo: parseElo(cellText($, cells, whiteRtgIdx)),
      whiteFed: "",
      whitePoints: parsePoints(cellText($, cells, whitePtsIdx)),
      result: parseResult(cellText($, cells, resolvedResultIdx)),
      blackNo: parseInt(cellText($, cells, blackNoIdx), 10) || 0,
      blackName,
      blackTitle: cellText($, cells, blackTitleIdx),
      blackElo: parseElo(cellText($, cells, blackRtgIdx)),
      blackFed: "",
      blackPoints: parsePoints(cellText($, cells, blackPtsIdx)),
    });
  } catch {
    // Skip malformed rows.
  }
}

export async function scrapePlayerCard(
  tnr: string,
  snr: string,
  fed: string,
  historyFrom?: string,
  historyTo?: string
): Promise<PlayerCard> {
  const url = BASE + "/tnr" + tnr + ".aspx?lan=1&art=9&fed=" + fed + "&snr=" + snr;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const tournamentName = $("title").text().replace("Chess-Results Server Chess-results.com -", "").trim();

  let name = "", title = "", playerFed = "", fideId = "";
  let elo = 0, eloNat = 0, eloIntl = 0;
  let performanceRating: number | null = null, points = 0, rank = 0;

  $("table").each((_, table) => {
    const rows = $(table).find("tr");
    const labels = rows.map((_, row) => cellText($, $(row).children("td, th"), 0).toLowerCase()).get();
    if (!labels.includes("name") || !labels.some((label) => label.includes("starting rank"))) return;

    rows.each((_, row) => {
      const cells = $(row).children("td, th");
      if (cells.length < 2) return;
      const label = cellText($, cells, 0).toLowerCase();
      const value = cellText($, cells, 1);

      if (label === "name") name = value;
      if (label === "title") title = value;
      if (label === "rating") elo = parseElo(value);
      if (label.includes("national")) eloNat = parseElo(value);
      if (label.includes("international")) eloIntl = parseElo(value);
      if (label.includes("performance")) performanceRating = parseElo(value) || null;
      if (label === "points") points = parsePoints(value) ?? 0;
      if (label === "rank") rank = parseInt(value, 10) || 0;
      if (label === "federation") playerFed = value;
      if (label.includes("fide") || label.includes("ident")) fideId = value && /^\d{4,}$/.test(value) ? value : fideId;
    });
    return false;
  });

  const startList = await scrapeTournamentPlayers(tnr, fed);
  const ownStart = startList.find((player) => player.snr === parseInt(snr, 10));
  if (ownStart) {
    if (!name) name = ownStart.name;
    if (!title) title = ownStart.title;
    if (!fideId) fideId = ownStart.fideId;
    if (!elo) elo = ownStart.elo;
    if (!playerFed) playerFed = ownStart.fed;
  }

  const results = parsePlayerResults($);
  const tournaments = name ? await scrapePlayerTournamentHistory(name, fideId, fed, historyFrom, historyTo) : [];

  return {
    tournamentId: tnr,
    tournamentName,
    snr: parseInt(snr, 10),
    name: name || "Igrac #" + snr,
    title,
    fed: playerFed || fed,
    fideId,
    elo,
    eloNational: eloNat,
    eloIntl,
    performanceRating,
    points,
    rank,
    results,
    tournaments,
  };
}

interface TournamentPlayerRow {
  snr: number;
  title: string;
  name: string;
  fideId: string;
  elo: number;
  fed: string;
}

async function scrapeTournamentPlayers(tnr: string, fed: string): Promise<TournamentPlayerRow[]> {
  const html = await fetchHtml(BASE + "/tnr" + tnr + ".aspx?lan=1&art=0&fed=" + fed);
  const $ = cheerio.load(html);
  const players: TournamentPlayerRow[] = [];

  $("table").each((_, table) => {
    const rows = $(table).find("tr").toArray();
    const headerIndex = rows.findIndex((row) => {
      const headers = $(row).children("td, th").map((_, cell) => cellText($, $(cell).parent().children("td, th"), _)).get();
      return headers.some((h) => normalizeHeaderLabel(h) === "sno" || normalizeHeaderLabel(h) === "no") && headers.some((h) => normalizeHeaderLabel(h) === "name");
    });
    if (headerIndex < 0) return;
    const headers = $(rows[headerIndex]).children("td, th").map((_, cell) => $(cell).text().replace(/\s+/g, " ").trim()).get();
    const noIdx = findAnyHeader(headers, ["sno", "no"]);
    const nameIdx = findAnyHeader(headers, ["name"]);
    const fideIdx = findAnyHeader(headers, ["fideid", "fide"]);
    const rtgIdx = findAnyHeader(headers, ["rtg", "rating"]);
    const fedIdx = findAnyHeader(headers, ["fed"]);

    for (let i = headerIndex + 1; i < rows.length; i++) {
      const cells = $(rows[i]).children("td, th");
      if (cells.length < 3) continue;
      const snr = parseInt(cellText($, cells, noIdx), 10) || 0;
      const playerName = cellText($, cells, nameIdx);
      if (!snr || !playerName) continue;
      players.push({
        snr,
        title: nameIdx > 0 ? cellText($, cells, nameIdx - 1) : "",
        name: playerName,
        fideId: fideIdx >= 0 ? cellText($, cells, fideIdx) : "",
        elo: rtgIdx >= 0 ? parseElo(cellText($, cells, rtgIdx)) : 0,
        fed: fedIdx >= 0 ? cellText($, cells, fedIdx) : fed,
      });
    }
    return false;
  });

  return players;
}

function parsePlayerResults($: cheerio.CheerioAPI): PlayerResult[] {
  const results: PlayerResult[] = [];

  $("table").each((_, table) => {
    const rows = $(table).find("tr").toArray();
    const headerIndex = rows.findIndex((row) => {
      const headers = $(row).children("td, th").map((_, cell) => $(cell).text().replace(/\s+/g, " ").trim()).get();
      return findAnyHeader(headers, ["rd"]) >= 0 && findAnyHeader(headers, ["res"]) >= 0 && findAnyHeader(headers, ["name"]) >= 0;
    });
    if (headerIndex < 0) return;

    const headers = $(rows[headerIndex]).children("td, th").map((_, cell) => $(cell).text().replace(/\s+/g, " ").trim()).get();
    const rdIdx = findAnyHeader(headers, ["rd"]);
    const boIdx = findAnyHeader(headers, ["bo"]);
    const snoIdx = findAnyHeader(headers, ["sno", "no"]);
    const nameIdx = findAnyHeader(headers, ["name"]);
    const rtgIdx = findAnyHeader(headers, ["rtg", "rating"]);
    const fedIdx = findAnyHeader(headers, ["fed"]);
    const ptsIdx = findAnyHeader(headers, ["pts"]);
    const resIdx = findAnyHeader(headers, ["res"]);

    for (let i = headerIndex + 1; i < rows.length; i++) {
      const cells = $(rows[i]).children("td, th");
      if (cells.length < 7) continue;
      const rd = parseInt(cellText($, cells, rdIdx), 10) || 0;
      if (!rd) continue;
      results.push({
        round: rd,
        board: parseInt(cellText($, cells, boIdx), 10) || 0,
        color: "white",
        oppNo: parseInt(cellText($, cells, snoIdx), 10) || 0,
        oppName: cellText($, cells, nameIdx),
        oppTitle: nameIdx > 0 ? cellText($, cells, nameIdx - 1) : "",
        oppElo: rtgIdx >= 0 ? parseElo(cellText($, cells, rtgIdx)) : 0,
        oppFed: fedIdx >= 0 ? cellText($, cells, fedIdx) : "",
        oppPoints: ptsIdx >= 0 ? parsePoints(cellText($, cells, ptsIdx)) : null,
        result: parsePlayerResult(cellText($, cells, resIdx)),
      });
    }
    return false;
  });

  return results;
}

async function scrapePlayerTournamentHistory(
  playerName: string,
  fideId: string,
  fed: string,
  from?: string,
  to?: string
): Promise<PlayerTournamentItem[]> {
  const fromDate = normalizeDate(from) || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const toDate = normalizeDate(to) || new Date().toISOString().slice(0, 10);
  const tournaments = await scrapeTournamentList(fed, fromDate, toDate);
  const limited = tournaments.slice(0, 80);
  const found: PlayerTournamentItem[] = [];
  const targetName = normalizePlayerName(playerName);

  await Promise.all(limited.map(async (tournament) => {
    try {
      const players = await scrapeTournamentPlayers(tournament.id, fed);
      const match = players.some((player) => {
        if (fideId && player.fideId && player.fideId === fideId) return true;
        return normalizePlayerName(player.name) === targetName;
      });
      if (match) found.push({ ...tournament });
    } catch {
      // Ignore individual tournament failures.
    }
  }));

  return found.sort((a, b) => (b.dateFrom || "").localeCompare(a.dateFrom || ""));
}

function normalizePlayerName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function findAnyHeader(headers: string[], wanted: string[]): number {
  return headers.findIndex((header) => wanted.includes(normalizeHeaderLabel(header)));
}
