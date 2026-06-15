import { NextRequest, NextResponse } from "next/server";
import { scrapeTournamentDetail } from "@/lib/scraper";
import type { ApiResponse, TournamentDetail } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// GET /api/v1/tournaments/:id?fed=SRB
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const fed = (req.nextUrl.searchParams.get("fed") || "SRB").toUpperCase().trim();
  const tnr = id.replace(/[^0-9]/g, "");

  if (!tnr || !/^[A-Z]{2,3}$/.test(fed)) {
    return NextResponse.json<ApiResponse<never>>(
      { ok: false, error: "Nevalidan ID turnira ili federacija" },
      { status: 400 }
    );
  }

  try {
    const data = await scrapeTournamentDetail(tnr, fed);
    return NextResponse.json<ApiResponse<TournamentDetail>>({ ok: true, data });
  } catch (err) {
    return NextResponse.json<ApiResponse<never>>(
      { ok: false, error: err instanceof Error ? err.message : "Greska pri dohvatu turnira" },
      { status: 500 }
    );
  }
}
