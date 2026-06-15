import { NextRequest, NextResponse } from "next/server";
import { scrapePlayerCard } from "@/lib/scraper";
import type { ApiResponse, PlayerCard } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// GET /api/v1/players/:tnr/:snr?fed=SRB&historyFrom=2026-06-01&historyTo=2026-06-15
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tnr: string; snr: string }> }
) {
  const { tnr, snr } = await params;
  const fed = (req.nextUrl.searchParams.get("fed") || "SRB").toUpperCase();
  const historyFrom = req.nextUrl.searchParams.get("historyFrom") || undefined;
  const historyTo = req.nextUrl.searchParams.get("historyTo") || undefined;

  if (!/^\d+$/.test(tnr) || !/^\d+$/.test(snr)) {
    return NextResponse.json<ApiResponse<never>>(
      { ok: false, error: "Nevažeći ID turnira ili broj igrača" },
      { status: 400 }
    );
  }

  try {
    const data = await scrapePlayerCard(tnr, snr, fed, historyFrom, historyTo);
    return NextResponse.json<ApiResponse<PlayerCard>>({ ok: true, data });
  } catch (err) {
    return NextResponse.json<ApiResponse<never>>(
      { ok: false, error: err instanceof Error ? err.message : "Greška pri dohvatu igrača" },
      { status: 500 }
    );
  }
}
