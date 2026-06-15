import { NextRequest, NextResponse } from "next/server";
import { scrapeTournamentPlayers, TournamentPlayerRow } from "@/lib/scraper";
import type { ApiResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// GET /api/v1/tournaments/:id/players?fed=SRB
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const fed = (req.nextUrl.searchParams.get("fed") || "SRB").toUpperCase();

  if (!/^\d+$/.test(id)) {
    return NextResponse.json<ApiResponse<never>>(
      { ok: false, error: "Nevažeći ID turnira" },
      { status: 400 }
    );
  }

  try {
    const data = await scrapeTournamentPlayers(id, fed);
    return NextResponse.json<ApiResponse<TournamentPlayerRow[]>>({ ok: true, data });
  } catch (err) {
    return NextResponse.json<ApiResponse<never>>(
      { ok: false, error: err instanceof Error ? err.message : "Greška pri dohvatu liste igrača" },
      { status: 500 }
    );
  }
}
