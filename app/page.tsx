"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Pairing, PlayerCard, RoundData, TournamentDetail, TournamentListItem } from "@/lib/types";

type Filters = { fed: string; selection: string; from: string; to: string };
type RouteState =
  | { view: "list" }
  | { view: "tournament"; tnr: string; fed: string }
  | { view: "player"; tnr: string; snr: number; fed: string };

const DEFAULT_FILTERS: Filters = { fed: "SRB", selection: "0", from: "", to: "" };

const TOURNAMENT_SELECTIONS = [
  { value: "0", label: "Svi turniri" },
  { value: "4", label: "Zavrseni u poslednjih 7 dana" },
  { value: "5", label: "Stariji zavrseni turniri" },
  { value: "7", label: "Poslednjih 10 nedelja sa partijama" },
];

const COUNTRIES = [
  { code: "SRB", name: "Srbija" }, { code: "CRO", name: "Hrvatska" },
  { code: "BIH", name: "Bosna i Hercegovina" }, { code: "MNE", name: "Crna Gora" },
  { code: "MKD", name: "Makedonija" }, { code: "SVN", name: "Slovenija" },
  { code: "GER", name: "Nemacka" }, { code: "AUT", name: "Austrija" },
  { code: "HUN", name: "Madjarska" }, { code: "ROU", name: "Rumunija" },
  { code: "BUL", name: "Bugarska" }, { code: "GRE", name: "Grcka" },
  { code: "TUR", name: "Turska" }, { code: "POL", name: "Poljska" },
  { code: "RUS", name: "Rusija" }, { code: "UKR", name: "Ukrajina" },
  { code: "FRA", name: "Francuska" }, { code: "ITA", name: "Italija" },
  { code: "ESP", name: "Spanija" }, { code: "NED", name: "Holandija" },
  { code: "CZE", name: "Ceska" }, { code: "SVK", name: "Slovacka" },
  { code: "USA", name: "SAD" }, { code: "IND", name: "Indija" },
  { code: "CHN", name: "Kina" },
];

function readFilters(): Filters {
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  const params = new URLSearchParams(window.location.search);
  return {
    fed: (params.get("fed") || DEFAULT_FILTERS.fed).toUpperCase(),
    selection: params.get("selection") || DEFAULT_FILTERS.selection,
    from: params.get("from") || "",
    to: params.get("to") || "",
  };
}

function readRoute(): RouteState {
  if (typeof window === "undefined") return { view: "list" };
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  const tnr = (params.get("tnr") || "").replace(/[^0-9]/g, "");
  const fed = (params.get("fed") || DEFAULT_FILTERS.fed).toUpperCase();
  const snr = parseInt(params.get("snr") || "", 10);
  if (view === "player" && tnr && snr > 0) return { view: "player", tnr, snr, fed };
  if (view === "tournament" && tnr) return { view: "tournament", tnr, fed };
  return { view: "list" };
}

function makeUrl(route: RouteState, filters: Filters, searched: boolean): string {
  const params = new URLSearchParams();
  params.set("fed", filters.fed);
  params.set("selection", filters.selection);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (searched) params.set("searched", "1");
  if (route.view !== "list") {
    params.set("view", route.view);
    params.set("tnr", route.tnr);
    params.set("fed", route.fed);
  }
  if (route.view === "player") params.set("snr", String(route.snr));
  const query = params.toString();
  return query ? "?" + query : window.location.pathname;
}

function normalizeHalf(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/Â½/g, "1/2").replace(/½/g, "1/2");
}

function formatResult(value: string | null): string {
  return normalizeHalf(value) || "...";
}

function resultTone(value: string | null): string {
  const result = normalizeHalf(value);
  if (result === "1-0" || result === "1") return "good";
  if (result === "0-1" || result === "0") return "bad";
  if (result === "1/2-1/2" || result === "1/2") return "draw";
  return "neutral";
}

function ResultBadge({ result }: { result: string | null }) {
  return <span className={"result-badge " + resultTone(result)}>{formatResult(result)}</span>;
}

function Spinner({ label = "Ucitavanje" }: { label?: string }) {
  return <div className="empty-state inline-state"><span className="spinner" /><p>{label}...</p></div>;
}

function ErrorBox({ msg }: { msg: string }) {
  return <div className="error-box">{msg}</div>;
}

function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button className="ghost-button back-button" type="button" onClick={onClick}>Nazad: {label}</button>;
}

function TournamentListScreen({ filters, setFilters, tournaments, setTournaments, searched, setSearched, onOpenTournament }: {
  filters: Filters;
  setFilters: (next: Filters) => void;
  tournaments: TournamentListItem[];
  setTournaments: (items: TournamentListItem[]) => void;
  searched: boolean;
  setSearched: (value: boolean) => void;
  onOpenTournament: (item: TournamentListItem) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters({ ...filters, [key]: key === "fed" ? value.toUpperCase() : value });
  };

  const search = useCallback(async () => {
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const params = new URLSearchParams({ fed: filters.fed, selection: filters.selection });
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      const res = await fetch("/api/v1/tournaments?" + params.toString());
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setTournaments(json.data);
      sessionStorage.setItem("chess-tracker:last-results", JSON.stringify(json.data));
      sessionStorage.setItem("chess-tracker:last-searched", "1");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Greska pri pretrazi");
    } finally {
      setLoading(false);
    }
  }, [filters, setSearched, setTournaments]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("searched") === "1" && !searched && !loading) search();
  }, [loading, search, searched]);

  return (
    <section className="screen-stack">
      <header className="hero compact-hero"><div><p className="eyebrow">Chess-results tracker</p><h1>Turniri po datumu</h1><p>Prvi korak samo nalazi turnire. Partije se ucitavaju tek kad otvoris turnir.</p></div></header>
      <section className="panel search-panel"><div className="filter-grid">
        <label><span>Zemlja</span><select value={filters.fed} onChange={(e) => updateFilter("fed", e.target.value)}>{COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.name} ({country.code})</option>)}</select></label>
        <label><span>Prikaz</span><select value={filters.selection} onChange={(e) => updateFilter("selection", e.target.value)}>{TOURNAMENT_SELECTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label><span>Od</span><input type="date" value={filters.from} onChange={(e) => updateFilter("from", e.target.value)} /></label>
        <label><span>Do</span><input type="date" value={filters.to} onChange={(e) => updateFilter("to", e.target.value)} /></label>
        <button className="primary-submit" type="button" disabled={loading} onClick={search}>{loading ? "Trazim" : "Pretrazi"}</button>
      </div></section>
      {loading && <Spinner label="Trazim turnire" />}
      {error && <ErrorBox msg={error} />}
      {searched && !loading && !error && <section className="panel results-panel"><div className="section-head"><div><p className="card-kicker">Rezultati</p><h2>{tournaments.length} turnira</h2></div></div>{tournaments.length === 0 ? <div className="empty-state"><h2>Nema turnira</h2><p>Promeni zemlju ili datume pa probaj ponovo.</p></div> : <div className="tournament-list">{tournaments.map((item) => <button className="tournament-card" type="button" key={item.id} onClick={() => onOpenTournament(item)}><span className="card-kicker">ID {item.id}</span><strong>{item.name}</strong><span className="muted-line">{item.city || item.country}</span><span className="meta-row"><span>{item.dateFrom || "-"}{item.dateTo && item.dateTo !== item.dateFrom ? " / " + item.dateTo : ""}</span><span>{item.rounds || "-"} kola</span><span>{item.players || "-"} igraca</span></span></button>)}</div>}</section>}
    </section>
  );
}

function TournamentScreen({ tnr, fed, cached, onBack, onOpenPlayer }: { tnr: string; fed: string; cached: TournamentListItem | null; onBack: () => void; onOpenPlayer: (snr: number) => void }) {
  const [detail, setDetail] = useState<TournamentDetail | null>(null);
  const [selectedRound, setSelectedRound] = useState(1);
  const [roundData, setRoundData] = useState<RoundData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [loadingRound, setLoadingRound] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoadingDetail(true);
    setError("");
    setDetail(null);
    (async () => {
      try {
        const res = await fetch("/api/v1/tournaments/" + tnr + "?fed=" + fed);
        const json = await res.json();
        if (!json.ok) throw new Error(json.error);
        if (active) setDetail(json.data);
      } catch (e: unknown) {
        if (active) setError(e instanceof Error ? e.message : "Greska pri ucitavanju turnira");
      } finally {
        if (active) setLoadingDetail(false);
      }
    })();
    return () => { active = false; };
  }, [tnr, fed]);

  const loadRound = useCallback(async (rd: number) => {
    setSelectedRound(rd);
    setLoadingRound(true);
    setError("");
    try {
      const res = await fetch("/api/v1/tournaments/" + tnr + "/rounds/" + rd + "?fed=" + fed);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setRoundData(json.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Greska pri ucitavanju kola");
      setRoundData(null);
    } finally {
      setLoadingRound(false);
    }
  }, [tnr, fed]);

  useEffect(() => { loadRound(1); }, [loadRound]);

  const title = detail?.name || cached?.name || "Turnir " + tnr;
  const totalRounds = Math.max(detail?.rounds || 0, roundData?.totalRounds || 0, cached?.rounds || 0, 1);
  const rounds = Array.from({ length: totalRounds }, (_, index) => index + 1);

  return <section className="screen-stack"><BackButton label="pretraga" onClick={onBack} /><section className="panel detail-panel"><p className="card-kicker">Turnir ID {tnr}</p><h1>{title}</h1><div className="meta-row detail-meta"><span>{fed}</span><span>{detail?.dateFrom || cached?.dateFrom || "datum nije ucitan"}</span>{(detail?.dateTo || cached?.dateTo) && <span>{detail?.dateTo || cached?.dateTo}</span>}{detail?.lastUpdate && <span>Update {detail.lastUpdate}</span>}</div>{loadingDetail && <p className="helper-text">Ucitavam podatke turnira...</p>}</section><section className="round-strip" aria-label="Kola">{rounds.map((rd) => <button className={rd === selectedRound ? "round-chip active" : "round-chip"} type="button" key={rd} onClick={() => loadRound(rd)}>Kolo {rd}</button>)}</section>{error && <ErrorBox msg={error} />}{loadingRound && <Spinner label={"Ucitavam kolo " + selectedRound} />}{!loadingRound && roundData && <section className="panel pairings-panel"><div className="section-head"><div><p className="card-kicker">Kolo {roundData.round}{roundData.date ? " / " + roundData.date : ""}</p><h2>{roundData.pairings.length} partija</h2></div></div>{roundData.pairings.length === 0 ? <div className="empty-state"><h2>Nema ucitanih parova</h2><p>Chess-results nije vratio tabelu parova za ovo kolo.</p></div> : <div className="pairing-list">{roundData.pairings.map((pairing: Pairing) => <article className="pairing-card" key={pairing.board + "-" + pairing.whiteNo + "-" + pairing.blackNo}><div className="board-no">{pairing.board}</div><button className="player-link white" type="button" onClick={() => pairing.whiteNo && onOpenPlayer(pairing.whiteNo)} disabled={!pairing.whiteNo}><strong>{pairing.whiteName || "-"}</strong><span>{pairing.whiteTitle || ""}{pairing.whiteElo ? " " + pairing.whiteElo : ""}</span></button><ResultBadge result={pairing.result} /><button className="player-link black" type="button" onClick={() => pairing.blackNo && onOpenPlayer(pairing.blackNo)} disabled={!pairing.blackNo}><strong>{pairing.blackName || "-"}</strong><span>{pairing.blackTitle || ""}{pairing.blackElo ? " " + pairing.blackElo : ""}</span></button></article>)}</div>}</section>}</section>;
}

function PlayerScreen({ tnr, snr, fed, onBack }: { tnr: string; snr: number; fed: string; onBack: () => void }) {
  const [card, setCard] = useState<PlayerCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const res = await fetch("/api/v1/players/" + tnr + "/" + snr + "?fed=" + fed);
        const json = await res.json();
        if (!json.ok) throw new Error(json.error);
        if (active) setCard(json.data);
      } catch (e: unknown) {
        if (active) setError(e instanceof Error ? e.message : "Greska pri ucitavanju igraca");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [tnr, snr, fed]);
  const wins = card?.results.filter((item) => item.result === "1").length ?? 0;
  const draws = card?.results.filter((item) => normalizeHalf(item.result) === "1/2").length ?? 0;
  const losses = card?.results.filter((item) => item.result === "0").length ?? 0;
  return <section className="screen-stack"><BackButton label="turnir" onClick={onBack} />{loading && <Spinner label="Ucitavam igraca" />}{error && <ErrorBox msg={error} />}{!loading && card && <><section className="panel player-panel"><p className="card-kicker">Igrac #{snr}</p><h1>{card.name}</h1><div className="meta-row detail-meta"><span>{card.fed || fed}</span>{card.title && <span>{card.title}</span>}{card.elo > 0 && <span>ELO {card.elo}</span>}<span>{card.points} poena</span></div><div className="stats-grid"><span><strong>{wins}</strong>Pobede</span><span><strong>{draws}</strong>Remiji</span><span><strong>{losses}</strong>Porazi</span></div></section><section className="panel"><p className="card-kicker">Partije po kolima</p><div className="player-results">{card.results.map((item) => <article className="player-result-row" key={item.round}><span>Kolo {item.round}</span><strong>{item.oppName || "-"}</strong><span>{item.oppElo || "-"}</span><span className={"player-result " + resultTone(item.result)}>{formatResult(item.result)}</span></article>)}</div></section></>}</section>;
}

export default function HomePage() {
  const [route, setRouteState] = useState<RouteState>(() => readRoute());
  const [filters, setFilters] = useState<Filters>(() => readFilters());
  const [tournaments, setTournaments] = useState<TournamentListItem[]>([]);
  const [searched, setSearchedState] = useState(false);

  useEffect(() => {
    const cached = sessionStorage.getItem("chess-tracker:last-results");
    const wasSearched = sessionStorage.getItem("chess-tracker:last-searched") === "1";
    if (cached) { try { setTournaments(JSON.parse(cached)); } catch {} }
    if (wasSearched) setSearchedState(true);
  }, []);

  useEffect(() => {
    const onPop = () => { setRouteState(readRoute()); setFilters(readFilters()); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const setRoute = (next: RouteState, mode: "push" | "replace" = "push") => {
    setRouteState(next);
    const url = makeUrl(next, filters, searched);
    if (mode === "replace") window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  };

  const setSearched = (value: boolean) => {
    setSearchedState(value);
    if (value) sessionStorage.setItem("chess-tracker:last-searched", "1");
  };

  const setFiltersAndUrl = (next: Filters) => {
    setFilters(next);
    const url = makeUrl(route, next, searched);
    window.history.replaceState(null, "", url);
  };

  const cachedTournament = route.view === "tournament" || route.view === "player" ? tournaments.find((item) => item.id === route.tnr) || null : null;

  return <main className="app-shell"><div className="phone-frame"><header className="topbar"><div className="brand"><span className="brand-mark">CT</span><span>Chess Tracker</span></div><span className="topbar-subtitle">chess-results</span></header>{route.view === "list" && <TournamentListScreen filters={filters} setFilters={setFiltersAndUrl} tournaments={tournaments} setTournaments={setTournaments} searched={searched} setSearched={setSearched} onOpenTournament={(item) => setRoute({ view: "tournament", tnr: item.id, fed: item.country || filters.fed })} />}{route.view === "tournament" && <TournamentScreen tnr={route.tnr} fed={route.fed} cached={cachedTournament} onBack={() => setRoute({ view: "list" })} onOpenPlayer={(snr) => setRoute({ view: "player", tnr: route.tnr, fed: route.fed, snr })} />}{route.view === "player" && <PlayerScreen tnr={route.tnr} snr={route.snr} fed={route.fed} onBack={() => setRoute({ view: "tournament", tnr: route.tnr, fed: route.fed })} />}</div></main>;
}
