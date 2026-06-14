import { NextRequest, NextResponse } from "next/server";
import { scrapeRound } from "@/lib/scraper";
import type { ApiResponse, RoundData } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// GET /api/v1/tournaments/:id/rounds/:round?fed=SRB
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; round: string }> }
) {
  const { id, round } = await params;
  const fed = (req.nextUrl.searchParams.get("fed") || "SRB").toUpperCase();

  const tnr = id.replace(/[^0-9]/g, "");
  const rd  = parseInt(round);

  if (!tnr || !rd || rd < 1 || rd > 30) {
    return NextResponse.json<ApiResponse<never>>(
      { ok: false, error: "Nevažeći ID turnira ili broj kola" },
      { status: 400 }
    );
  }

  try {
    const data = await scrapeRound(tnr, rd, fed);
    return NextResponse.json<ApiResponse<RoundData>>({ ok: true, data });
  } catch (err) {
    return NextResponse.json<ApiResponse<never>>(
      { ok: false, error: err instanceof Error ? err.message : "Greška pri dohvatu kola" },
      { status: 500 }
    );
  }
}
