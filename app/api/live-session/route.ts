import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
  const model = process.env.GEMINI_MODEL || "gemini-3.8-live";
  const voice = process.env.GEMINI_VOICE || "Puck";

  return NextResponse.json({
    apiKey,
    model,
    voice,
    hasApiKey: Boolean(apiKey),
    wsEndpoint:
      "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent",
  });
}
