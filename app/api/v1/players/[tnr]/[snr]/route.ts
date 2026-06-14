import { NextRequest, NextResponse } from "next/server";
import { scrapePlayerCard } from "@/lib/scraper";
import type { ApiResponse, PlayerCard } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// GET /api/v1/players/:tnr/:snr?fed=SRB
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tnr: string; snr: string }> }
) {
  const { tnr, snr } = await params;
  const fed = (req.nextUrl.searchParams.get("fed") || "SRB").toUpperCase();

  if (!/^\d+$/.test(tnr) || !/^\d+$/.test(snr)) {
    return NextResponse.json<ApiResponse<never>>(
      { ok: false, error: "Nevažeći ID turnira ili broj igrača" },
      { status: 400 }
    );
  }

  try {
    const data = await scrapePlayerCard(tnr, snr, fed);
    return NextResponse.json<ApiResponse<PlayerCard>>({ ok: true, data });
  } catch (err) {
    return NextResponse.json<ApiResponse<never>>(
      { ok: false, error: err instanceof Error ? err.message : "Greška pri dohvatu igrača" },
      { status: 500 }
    );
  }
}
