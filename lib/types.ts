// ─── Turnir ─────────────────────────────────────────────────────────────────

export interface TournamentListItem {
  id: string;
  name: string;
  dateFrom: string;   // "YYYY-MM-DD"
  dateTo: string;
  city: string;
  country: string;    // "SRB"
  rounds: number;
  players: number;
}

export interface TournamentDetail {
  id: string;
  name: string;
  dateFrom: string;
  dateTo: string;
  city: string;
  country: string;
  rounds: number;           // ukupno kola
  currentRound: number;     // zadnje igrano kolo
  lastUpdate: string;
  organizer: string;
}

// ─── Parovi po kolu ─────────────────────────────────────────────────────────

export interface Pairing {
  board: number;
  whiteNo: number;
  whiteName: string;
  whiteTitle: string;
  whiteElo: number;
  whiteFed: string;
  whitePoints: number | null;   // bodovi prije partije
  result: string | null;        // "1-0" | "0-1" | "½-½" | null
  blackNo: number;
  blackName: string;
  blackTitle: string;
  blackElo: number;
  blackFed: string;
  blackPoints: number | null;
}

export interface RoundData {
  tournamentId: string;
  tournamentName: string;
  round: number;
  totalRounds: number;
  date: string;
  pairings: Pairing[];
}

// ─── Kartica igrača ─────────────────────────────────────────────────────────

export interface PlayerResult {
  round: number;
  board: number;
  color: "white" | "black";
  oppNo: number;
  oppName: string;
  oppTitle: string;
  oppElo: number;
  oppFed: string;
  oppPoints: number | null;
  result: "1" | "0" | "½" | "+" | "-" | null;  // null = nije odigrano
}

export interface PlayerTournamentItem {
  id: string;
  name: string;
  dateFrom: string;
  dateTo: string;
  city: string;
  country: string;
  rounds: number;
  players: number;
}

export interface PlayerCard {
  tournamentId: string;
  tournamentName: string;
  snr: number;              // starting number
  name: string;
  title: string;
  fed: string;
  fideId: string;
  elo: number;
  eloNational: number;
  eloIntl: number;
  performanceRating: number | null;
  points: number;
  rank: number;
  results: PlayerResult[];
  tournaments: PlayerTournamentItem[];
}

// ─── API response ────────────────────────────────────────────────────────────

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
