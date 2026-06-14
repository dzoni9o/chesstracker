import { NextRequest, NextResponse } from "next/server";
import { scrapeTournamentList } from "@/lib/scraper";
import type { ApiResponse, TournamentListItem } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// GET /api/v1/tournaments?fed=SRB&from=2026-01-01&to=2026-12-31
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const fed  = (searchParams.get("fed") || "SRB").toUpperCase().trim();
  const from = searchParams.get("from") || "";
  const to   = searchParams.get("to")   || "";
  const selection = searchParams.get("selection") || "0";

  if (!/^[A-Z]{2,3}$/.test(fed)) {
    return NextResponse.json<ApiResponse<never>>(
      { ok: false, error: "Nevažeći kod federacije (npr. SRB, CRO, GER)" },
      { status: 400 }
    );
  }

  try {
    const tournaments = await scrapeTournamentList(fed, from, to, selection);
    return NextResponse.json<ApiResponse<TournamentListItem[]>>({
      ok: true,
      data: tournaments,
    });
  } catch (err) {
    return NextResponse.json<ApiResponse<never>>(
      { ok: false, error: err instanceof Error ? err.message : "Greška pri dohvatu turnira" },
      { status: 500 }
    );
  }
}
