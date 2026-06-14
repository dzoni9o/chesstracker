"use client";

import { useState, useCallback } from "react";
import type {
  TournamentListItem,
  RoundData,
  PlayerCard,
  Pairing,
} from "@/lib/types";

// ─── Konstante ───────────────────────────────────────────────────────────────

const COUNTRIES = [
  { code: "SRB", name: "Srbija 🇷🇸" },
  { code: "CRO", name: "Hrvatska 🇭🇷" },
  { code: "BIH", name: "Bosna i Hercegovina 🇧🇦" },
  { code: "MNE", name: "Crna Gora 🇲🇪" },
  { code: "MKD", name: "Makedonija 🇲🇰" },
  { code: "SVN", name: "Slovenija 🇸🇮" },
  { code: "GER", name: "Nemačka 🇩🇪" },
  { code: "AUT", name: "Austrija 🇦🇹" },
  { code: "HUN", name: "Mađarska 🇭🇺" },
  { code: "ROU", name: "Rumunija 🇷🇴" },
  { code: "BUL", name: "Bugarska 🇧🇬" },
  { code: "GRE", name: "Grčka 🇬🇷" },
  { code: "TUR", name: "Turska 🇹🇷" },
  { code: "POL", name: "Poljska 🇵🇱" },
  { code: "RUS", name: "Rusija 🇷🇺" },
  { code: "UKR", name: "Ukrajina 🇺🇦" },
  { code: "FRA", name: "Francuska 🇫🇷" },
  { code: "ITA", name: "Italija 🇮🇹" },
  { code: "ESP", name: "Španija 🇪🇸" },
  { code: "NED", name: "Holandija 🇳🇱" },
  { code: "CZE", name: "Češka 🇨🇿" },
  { code: "SVK", name: "Slovačka 🇸🇰" },
  { code: "USA", name: "SAD 🇺🇸" },
  { code: "IND", name: "Indija 🇮🇳" },
  { code: "CHN", name: "Kina 🇨🇳" },
];

// ─── Stilovi ─────────────────────────────────────────────────────────────────

const S = {
  page:    { background: "#0a0a0a", color: "#fff", minHeight: "100vh", fontFamily: "monospace" } as React.CSSProperties,
  header:  { background: "#111", borderBottom: "1px solid #222", padding: "12px 16px", position: "sticky" as const, top: 0, zIndex: 50 },
  content: { maxWidth: 900, margin: "0 auto", padding: "20px 16px" },
  card:    { background: "#141414", border: "1px solid #2a2a2a", borderRadius: 6, padding: "16px", marginBottom: 12 },
  accent:  { color: "#eaff00" },
  muted:   { color: "#555", fontSize: 12 },
  input:   { background: "#1a1a1a", border: "1px solid #333", borderRadius: 4, padding: "8px 12px", color: "#fff", fontFamily: "monospace", fontSize: 13, width: "100%" } as React.CSSProperties,
  btn:     { background: "#eaff00", color: "#0a0a0a", border: "none", borderRadius: 4, padding: "9px 18px", fontFamily: "monospace", fontWeight: 700, fontSize: 13, cursor: "pointer" } as React.CSSProperties,
  btnSec:  { background: "#1a1a1a", color: "#eaff00", border: "1px solid #eaff00", borderRadius: 4, padding: "7px 14px", fontFamily: "monospace", fontWeight: 700, fontSize: 12, cursor: "pointer" } as React.CSSProperties,
  rdBtn:   (active: boolean) => ({
    background: active ? "#eaff00" : "#1a1a1a",
    color:      active ? "#0a0a0a" : "#666",
    border:     `1px solid ${active ? "#eaff00" : "#2a2a2a"}`,
    borderRadius: 4, padding: "6px 12px", fontFamily: "monospace",
    fontWeight: 700, fontSize: 12, cursor: "pointer",
  } as React.CSSProperties),
  table:   { width: "100%", borderCollapse: "collapse" as const, background: "#141414", border: "1px solid #2a2a2a", borderRadius: 6, overflow: "hidden" },
  th:      { padding: "10px 12px", textAlign: "left" as const, color: "#eaff00", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 0.5, background: "#1e1e1e", borderBottom: "2px solid rgba(234,255,0,0.2)" },
  td:      { padding: "10px 12px", borderBottom: "1px solid #1a1a1a", fontSize: 13 },
};

// ─── Pomoćne komponente ──────────────────────────────────────────────────────

function ResultBadge({ result }: { result: string | null }) {
  if (!result) return <span style={{ color: "#444" }}>···</span>;
  const color =
    result === "1-0" ? "#4ade80" :
    result === "0-1" ? "#ef4444" :
    result === "½-½" ? "#facc15" : "#888";
  return (
    <span style={{ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 3, padding: "2px 8px", fontFamily: "monospace", fontWeight: 700, fontSize: 12 }}>
      {result}
    </span>
  );
}

function PlayerResultBadge({ result }: { result: string | null }) {
  if (!result) return <span style={{ color: "#444", fontFamily: "monospace" }}>?</span>;
  const map: Record<string, [string, string]> = {
    "1": ["✓", "#4ade80"], "0": ["✗", "#ef4444"],
    "½": ["½", "#facc15"], "+": ["+", "#4ade80"], "-": ["-", "#ef4444"],
  };
  const [label, color] = map[result] ?? [result, "#888"];
  return <span style={{ color, fontWeight: 700, fontFamily: "monospace", fontSize: 15 }}>{label}</span>;
}

function Spinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "40px 0", color: "#555" }}>
      <div style={{ width: 20, height: 20, border: "2px solid #333", borderTopColor: "#eaff00", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
      Učitavanje...
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div style={{ background: "#1a0000", border: "1px solid #ef444433", borderRadius: 6, padding: 16, color: "#ef4444", fontSize: 13 }}>
      ⚠ {msg}
    </div>
  );
}

function BackBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ ...S.btnSec, marginBottom: 20, display: "inline-flex", alignItems: "center", gap: 6 }}>
      ← {label}
    </button>
  );
}

// ─── Ekran 1: Filter + lista turnira ─────────────────────────────────────────

function TournamentListScreen({
  onSelect,
}: {
  onSelect: (t: TournamentListItem) => void;
}) {
  const [fed, setFed] = useState("SRB");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tournaments, setTournaments] = useState<TournamentListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  const search = useCallback(async () => {
    setLoading(true);
    setError("");
    setSearched(true);

    try {
      const params = new URLSearchParams({ fed });
      if (from) params.set("from", from);
      if (to)   params.set("to", to);

      const res = await fetch(`/api/v1/tournaments?${params}`);
      const json = await res.json();

      if (!json.ok) throw new Error(json.error);
      setTournaments(json.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Greška");
    } finally {
      setLoading(false);
    }
  }, [fed, from, to]);

  return (
    <>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ color: "#eaff00", fontFamily: "sans-serif", fontSize: 32, fontWeight: 800, margin: "0 0 8px" }}>♞ Chess Tracker</h1>
        <p style={{ ...S.muted, fontSize: 14 }}>Pretražuj šahovske turnire iz bilo koje zemlje</p>
      </div>

      {/* Filter */}
      <div style={{ ...S.card, marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
          <div>
            <label style={{ ...S.muted, display: "block", marginBottom: 6 }}>Zemlja</label>
            <select value={fed} onChange={e => setFed(e.target.value)} style={{ ...S.input }}>
              {COUNTRIES.map(c => (
                <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ ...S.muted, display: "block", marginBottom: 6 }}>Od datuma</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={S.input} />
          </div>
          <div>
            <label style={{ ...S.muted, display: "block", marginBottom: 6 }}>Do datuma</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={S.input} />
          </div>
          <button onClick={search} style={S.btn} disabled={loading}>
            {loading ? "..." : "Pretraži"}
          </button>
        </div>
      </div>

      {loading && <Spinner />}
      {error && <ErrorBox msg={error} />}

      {searched && !loading && !error && (
        <>
          <div style={{ ...S.muted, marginBottom: 12 }}>
            Pronađeno: <strong style={{ color: "#eaff00" }}>{tournaments.length}</strong> turnira
          </div>

          {tournaments.length === 0 ? (
            <div style={{ ...S.card, textAlign: "center", padding: 40, color: "#555" }}>
              Nema turnira za odabrane kriterijume
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Naziv turnira</th>
                    <th style={S.th}>Datum</th>
                    <th style={{ ...S.th, textAlign: "center" }}>Kola</th>
                    <th style={{ ...S.th, textAlign: "center" }}>Igrači</th>
                    <th style={S.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {tournaments.map(t => (
                    <tr key={t.id} style={{ cursor: "pointer" }} onClick={() => onSelect(t)}>
                      <td style={S.td}>
                        <span style={{ color: "#eaff00", fontWeight: 600 }}>{t.name}</span>
                        {t.city && <div style={{ ...S.muted, marginTop: 2 }}>{t.city}</div>}
                      </td>
                      <td style={S.td}>
                        <span style={{ fontFamily: "monospace", fontSize: 12 }}>
                          {t.dateFrom || "—"}
                          {t.dateTo && t.dateTo !== t.dateFrom && ` → ${t.dateTo}`}
                        </span>
                      </td>
                      <td style={{ ...S.td, textAlign: "center", color: "#eaff00", fontWeight: 700 }}>
                        {t.rounds || "—"}
                      </td>
                      <td style={{ ...S.td, textAlign: "center" }}>
                        {t.players || "—"}
                      </td>
                      <td style={{ ...S.td, textAlign: "right" }}>
                        <button style={S.btnSec} onClick={e => { e.stopPropagation(); onSelect(t); }}>
                          Otvori →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </>
  );
}

// ─── Ekran 2: Turnir — runde + parovi ────────────────────────────────────────

function TournamentScreen({
  tournament,
  onBack,
  onPlayer,
}: {
  tournament: TournamentListItem;
  onBack: () => void;
  onPlayer: (tnr: string, snr: number, fed: string, name: string) => void;
}) {
  const [selectedRound, setSelectedRound] = useState(1);
  const [roundData, setRoundData] = useState<RoundData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [totalRounds, setTotalRounds] = useState(tournament.rounds || 7);

  const loadRound = useCallback(async (rd: number) => {
    setLoading(true);
    setError("");
    setSelectedRound(rd);

    try {
      const res = await fetch(`/api/v1/tournaments/${tournament.id}/rounds/${rd}?fed=${tournament.country}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setRoundData(json.data);
      if (json.data.totalRounds > totalRounds) {
        setTotalRounds(json.data.totalRounds);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Greška");
    } finally {
      setLoading(false);
    }
  }, [tournament, totalRounds]);

  // Učitaj kolo 1 odmah
  useState(() => { loadRound(1); });

  const rounds = Array.from({ length: totalRounds }, (_, i) => i + 1);

  return (
    <>
      <BackBtn label="Turniri" onClick={onBack} />

      <h2 style={{ color: "#eaff00", fontFamily: "sans-serif", fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>
        {tournament.name}
      </h2>
      <p style={S.muted}>
        {tournament.country}
        {tournament.dateFrom && ` · ${tournament.dateFrom}`}
        {tournament.dateTo && ` → ${tournament.dateTo}`}
      </p>

      {/* Tabs kola */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "20px 0 16px" }}>
        {rounds.map(rd => (
          <button key={rd} onClick={() => loadRound(rd)} style={S.rdBtn(selectedRound === rd)}>
            Kolo {rd}
          </button>
        ))}
      </div>

      {loading && <Spinner />}
      {error && <ErrorBox msg={error} />}

      {!loading && roundData && (
        <>
          <div style={{ ...S.muted, marginBottom: 12 }}>
            Kolo {roundData.round} / {roundData.totalRounds}
            {roundData.date && ` · ${roundData.date}`}
            {" · "}<strong style={{ color: "#eaff00" }}>{roundData.pairings.length}</strong> partija
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={{ ...S.th, width: 36 }}>#</th>
                  <th style={S.th}>Beli</th>
                  <th style={{ ...S.th, textAlign: "center" }}>Elo</th>
                  <th style={{ ...S.th, textAlign: "center" }}>Rezultat</th>
                  <th style={{ ...S.th, textAlign: "center" }}>Elo</th>
                  <th style={S.th}>Crni</th>
                </tr>
              </thead>
              <tbody>
                {roundData.pairings.map((p: Pairing) => (
                  <tr key={p.board}>
                    <td style={{ ...S.td, color: "#eaff00", fontWeight: 700, textAlign: "center" }}>
                      {p.board}
                    </td>
                    <td style={S.td}>
                      <span
                        onClick={() => p.whiteNo && onPlayer(tournament.id, p.whiteNo, tournament.country, p.whiteName)}
                        style={{ cursor: p.whiteNo ? "pointer" : "default", textDecoration: p.whiteNo ? "underline" : "none", textDecorationColor: "#eaff0066" }}
                      >
                        {p.whiteName || "—"}
                      </span>
                      {p.whiteTitle && <span style={{ color: "#eaff0088", fontSize: 11, marginLeft: 6 }}>{p.whiteTitle}</span>}
                    </td>
                    <td style={{ ...S.td, textAlign: "center", color: "#666", fontSize: 12 }}>
                      {p.whiteElo > 0 ? p.whiteElo : "—"}
                    </td>
                    <td style={{ ...S.td, textAlign: "center" }}>
                      <ResultBadge result={p.result} />
                    </td>
                    <td style={{ ...S.td, textAlign: "center", color: "#666", fontSize: 12 }}>
                      {p.blackElo > 0 ? p.blackElo : "—"}
                    </td>
                    <td style={S.td}>
                      <span
                        onClick={() => p.blackNo && onPlayer(tournament.id, p.blackNo, tournament.country, p.blackName)}
                        style={{ cursor: p.blackNo ? "pointer" : "default", textDecoration: p.blackNo ? "underline" : "none", textDecorationColor: "#eaff0066" }}
                      >
                        {p.blackName || "—"}
                      </span>
                      {p.blackTitle && <span style={{ color: "#eaff0088", fontSize: 11, marginLeft: 6 }}>{p.blackTitle}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

// ─── Ekran 3: Kartica igrača ─────────────────────────────────────────────────

function PlayerScreen({
  tnr,
  snr,
  fed,
  name,
  onBack,
}: {
  tnr: string;
  snr: number;
  fed: string;
  name: string;
  onBack: () => void;
}) {
  const [card, setCard] = useState<PlayerCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useState(() => {
    (async () => {
      try {
        const res = await fetch(`/api/v1/players/${tnr}/${snr}?fed=${fed}`);
        const json = await res.json();
        if (!json.ok) throw new Error(json.error);
        setCard(json.data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Greška");
      } finally {
        setLoading(false);
      }
    })();
  });

  const totalPoints = card?.points ?? 0;
  const wins = card?.results.filter(r => r.result === "1").length ?? 0;
  const losses = card?.results.filter(r => r.result === "0").length ?? 0;
  const draws = card?.results.filter(r => r.result === "½").length ?? 0;

  return (
    <>
      <BackBtn label="Turnir" onClick={onBack} />

      {loading && <Spinner />}
      {error && <ErrorBox msg={error} />}

      {!loading && card && (
        <>
          {/* Profil header */}
          <div style={{ ...S.card, borderColor: "#eaff0044", marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 28 }}>♟</span>
                  <div>
                    <h2 style={{ color: "#eaff00", fontFamily: "sans-serif", fontSize: 22, fontWeight: 800, margin: 0 }}>
                      {card.name}
                    </h2>
                    <div style={{ ...S.muted, marginTop: 2 }}>
                      {card.title && <span style={{ color: "#eaff0088", marginRight: 8 }}>{card.title}</span>}
                      {card.fed}
                      {card.elo > 0 && <span style={{ marginLeft: 8 }}>· ELO {card.elo}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ ...S.muted, fontSize: 12 }}>{card.tournamentName}</div>
              </div>

              {/* Stats */}
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                {[
                  { label: "Bodova", val: totalPoints, color: "#eaff00" },
                  { label: "Rang", val: card.rank || "—", color: "#fff" },
                  { label: "Performance", val: card.performanceRating ?? "—", color: "#a78bfa" },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.val}</div>
                    <div style={S.muted}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* W/D/L bar */}
            <div style={{ display: "flex", gap: 16, marginTop: 16, paddingTop: 16, borderTop: "1px solid #222" }}>
              {[
                { label: "Pobede", val: wins, color: "#4ade80" },
                { label: "Remiji", val: draws, color: "#facc15" },
                { label: "Porazi", val: losses, color: "#ef4444" },
              ].map(s => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: s.color, fontWeight: 700, fontSize: 18, fontFamily: "monospace" }}>{s.val}</span>
                  <span style={S.muted}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Rezultati po kolima */}
          <h3 style={{ color: "#eaff00", fontFamily: "sans-serif", fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
            Partije po kolima
          </h3>

          <table style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.th, width: 40 }}>Kolo</th>
                <th style={{ ...S.th, width: 40 }}>Tabla</th>
                <th style={{ ...S.th, width: 36 }}>Boja</th>
                <th style={S.th}>Protivnik</th>
                <th style={{ ...S.th, textAlign: "center" }}>Elo</th>
                <th style={{ ...S.th, textAlign: "center" }}>Bodovi</th>
                <th style={{ ...S.th, textAlign: "center" }}>Rez.</th>
              </tr>
            </thead>
            <tbody>
              {card.results.map(r => (
                <tr key={r.round}>
                  <td style={{ ...S.td, color: "#eaff00", fontWeight: 700, textAlign: "center" }}>{r.round}</td>
                  <td style={{ ...S.td, textAlign: "center", color: "#666" }}>{r.board || "—"}</td>
                  <td style={{ ...S.td, textAlign: "center" }}>
                    {r.color === "white" ? "♔" : r.color === "black" ? "♚" : "—"}
                  </td>
                  <td style={S.td}>
                    <span style={{ fontFamily: "sans-serif" }}>{r.oppName || "—"}</span>
                    {r.oppTitle && <span style={{ color: "#eaff0088", fontSize: 11, marginLeft: 6 }}>{r.oppTitle}</span>}
                  </td>
                  <td style={{ ...S.td, textAlign: "center", color: "#666", fontSize: 12 }}>
                    {r.oppElo > 0 ? r.oppElo : "—"}
                  </td>
                  <td style={{ ...S.td, textAlign: "center", color: "#888", fontSize: 12 }}>
                    {r.oppPoints != null ? r.oppPoints : "—"}
                  </td>
                  <td style={{ ...S.td, textAlign: "center" }}>
                    <PlayerResultBadge result={r.result} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

// ─── Navigacija ───────────────────────────────────────────────────────────────

type Screen =
  | { type: "list" }
  | { type: "tournament"; data: TournamentListItem }
  | { type: "player"; tnr: string; snr: number; fed: string; name: string; from: TournamentListItem };

export default function HomePage() {
  const [screen, setScreen] = useState<Screen>({ type: "list" });

  return (
    <div style={S.page}>
      {/* Global header */}
      <header style={S.header}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 30, height: 30, background: "#eaff00", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 17, color: "#0a0a0a" }}>
            ♞
          </div>
          <div>
            <span style={{ color: "#eaff00", fontWeight: 700, fontSize: 15 }}>Chess Tracker</span>
            <span style={{ color: "#555", fontSize: 11, marginLeft: 8 }}>chess-results.com</span>
          </div>
        </div>
      </header>

      <main style={S.content}>
        {screen.type === "list" && (
          <TournamentListScreen
            onSelect={t => setScreen({ type: "tournament", data: t })}
          />
        )}

        {screen.type === "tournament" && (
          <TournamentScreen
            tournament={screen.data}
            onBack={() => setScreen({ type: "list" })}
            onPlayer={(tnr, snr, fed, name) =>
              setScreen({ type: "player", tnr, snr, fed, name, from: screen.data })
            }
          />
        )}

        {screen.type === "player" && (
          <PlayerScreen
            tnr={screen.tnr}
            snr={screen.snr}
            fed={screen.fed}
            name={screen.name}
            onBack={() => setScreen({ type: "tournament", data: screen.from })}
          />
        )}
      </main>
    </div>
  );
}
