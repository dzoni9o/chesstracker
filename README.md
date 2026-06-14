# Chess Tracker

Aplikacija za praćenje šahovskih turnira sa chess-results.com.
Podržava **sve zemlje** (FIDE federacije), filter po datumu, pregled kola i kartice igrača.

---

## API Endpoints

### 1. Lista turnira po zemlji

```
GET /api/v1/tournaments?fed=SRB&from=2026-01-01&to=2026-12-31
```

| Param | Obavezno | Opis |
|-------|----------|------|
| `fed` | ✅ | FIDE kod (SRB, CRO, GER...) |
| `from` | ❌ | Datum od (YYYY-MM-DD) |
| `to` | ❌ | Datum do (YYYY-MM-DD) |

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "1437598",
      "name": "MALI ZEMUNAC",
      "dateFrom": "2026-06-13",
      "dateTo": "2026-06-13",
      "city": "Zemun",
      "country": "SRB",
      "rounds": 7,
      "players": 28
    }
  ]
}
```

---

### 2. Parovi za kolo

```
GET /api/v1/tournaments/:id/rounds/:round?fed=SRB
```

| Param | Opis |
|-------|------|
| `id` | ID turnira (npr. `1437598`) |
| `round` | Broj kola (1, 2, 3...) |
| `fed` | FIDE kod |

**Response:**
```json
{
  "ok": true,
  "data": {
    "tournamentId": "1437598",
    "tournamentName": "MALI ZEMUNAC",
    "round": 1,
    "totalRounds": 7,
    "date": "2026/06/13",
    "pairings": [
      {
        "board": 1,
        "whiteNo": 1,
        "whiteName": "Sakotic, Nikola",
        "whiteTitle": "AFM",
        "whiteElo": 2174,
        "whiteFed": "SRB",
        "whitePoints": 0,
        "result": "1-0",
        "blackNo": 15,
        "blackName": "Milanovic, Konstantin",
        "blackTitle": "",
        "blackElo": 0,
        "blackFed": "SRB",
        "blackPoints": 0
      }
    ]
  }
}
```

---

### 3. Kartica igrača

```
GET /api/v1/players/:tnr/:snr?fed=SRB
```

| Param | Opis |
|-------|------|
| `tnr` | ID turnira |
| `snr` | Starting number igrača (iz pairing tabele) |
| `fed` | FIDE kod |

**Response:**
```json
{
  "ok": true,
  "data": {
    "tournamentId": "1437598",
    "tournamentName": "MALI ZEMUNAC",
    "snr": 15,
    "name": "Milanovic, Konstantin",
    "title": "",
    "fed": "SRB",
    "elo": 0,
    "eloNational": 0,
    "eloIntl": 0,
    "performanceRating": 1548,
    "points": 3,
    "rank": 12,
    "results": [
      {
        "round": 1,
        "board": 1,
        "color": "black",
        "oppNo": 1,
        "oppName": "Sakotic, Nikola",
        "oppTitle": "AFM",
        "oppElo": 2174,
        "oppFed": "SRB",
        "oppPoints": 5.5,
        "result": "0"
      }
    ]
  }
}
```

---

## Error Response

```json
{ "ok": false, "error": "Opis greške" }
```

---

## FIDE kodovi zemalja

| Kôd | Zemlja |
|-----|--------|
| SRB | Srbija |
| CRO | Hrvatska |
| BIH | Bosna i Hercegovina |
| MNE | Crna Gora |
| GER | Nemačka |
| AUT | Austrija |
| HUN | Mađarska |
| POL | Poljska |
| RUS | Rusija |
| USA | SAD |
| IND | Indija |
| CHN | Kina |
| ... | (bilo koji FIDE kod) |

---

## Deploy

```bash
npm install
npm run dev      # localhost:3000

# Production
git push → Vercel auto-deploy
```

---

## Struktura

```
chess-tracker/
├── app/
│   ├── api/v1/
│   │   ├── tournaments/
│   │   │   └── [id]/rounds/[round]/  ← parovi kola
│   │   └── players/[tnr]/[snr]/      ← kartica igrača
│   └── page.tsx                      ← React SPA (3 ekrana)
├── lib/
│   ├── scraper.ts                    ← Cheerio parseri
│   └── types.ts                      ← TypeScript tipovi
└── README.md
```
