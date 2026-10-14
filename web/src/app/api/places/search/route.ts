import { NextResponse, type NextRequest } from "next/server";
import { FCT, GOOGLE_MAPS_KEY, failed, notConfigured, sessionToken } from "@/lib/google";

// Google Places autocomplete, limited to the FCT.
export async function GET(req: NextRequest) {
  if (!GOOGLE_MAPS_KEY) return notConfigured();
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ results: [] });

  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_MAPS_KEY },
    body: JSON.stringify({
      input: q,
      sessionToken: sessionToken(req.nextUrl.searchParams.get("session")),
      includedRegionCodes: ["ng"],
      locationRestriction: { rectangle: FCT },
      languageCode: "en",
    }),
  }).catch(() => null);
  if (!res?.ok) return failed();

  type Suggestion = { placePrediction?: { placeId: string; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }; text?: { text: string } } };
  const data = (await res.json()) as { suggestions?: Suggestion[] };
  const results = (data.suggestions ?? []).flatMap(({ placePrediction: p }) => (p ? [{
    id: p.placeId,
    main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
    secondary: (p.structuredFormat?.secondaryText?.text ?? "").replace(/,?\s*Nigeria$/, ""),
  }] : []));
  return NextResponse.json({ results });
}
