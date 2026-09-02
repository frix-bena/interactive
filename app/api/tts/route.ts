import { NextResponse } from "next/server";

// In-memory audio cache for frequent phrases
const audioCache = new Map<string, Buffer>();
const MAX_CACHE_SIZE = 100;

function sanitizeForSpeech(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/[*_~`#\[\]\(\)\{\}\>\<\+\=\|\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitIntoChunks(text: string, maxLength = 135): string[] {
  const clean = sanitizeForSpeech(text);
  if (clean.length <= maxLength) return [clean];

  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if ((current + " " + trimmed).trim().length <= maxLength) {
      current = (current + " " + trimmed).trim();
    } else {
      if (current) chunks.push(current);
      if (trimmed.length <= maxLength) {
        current = trimmed;
      } else {
        // Break long sentence by comma or words
        const words = trimmed.split(" ");
        current = "";
        for (const word of words) {
          if ((current + " " + word).trim().length <= maxLength) {
            current = (current + " " + word).trim();
          } else {
            if (current) chunks.push(current);
            current = word;
          }
        }
      }
    }
  }

  if (current) chunks.push(current);
  return chunks.filter((c) => c.trim().length > 0);
}

async function fetchGoogleTTS(chunk: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
      chunk
    )}&tl=en&client=tw-ob`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "audio/mpeg, audio/*;q=0.9, */*;q=0.5",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Google TTS error status ${res.status}`);
    }

    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function generateOpenAITTS(apiKey: string, text: string): Promise<Buffer | null> {
  const voice = process.env.OPENAI_TTS_VOICE || "onyx";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text.slice(0, 1000),
        voice,
        response_format: "mp3",
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn("OpenAI TTS failed, falling back to Google TTS:", res.status);
      return null;
    }

    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch (err) {
    console.warn("Error calling OpenAI TTS:", err);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function generateAudio(text: string): Promise<{ buffer: Buffer; engine: string }> {
  const clean = sanitizeForSpeech(text).slice(0, 1000);
  if (!clean) {
    throw new Error("Text is empty after sanitization.");
  }

  // Check cache
  const cached = audioCache.get(clean);
  if (cached) {
    return { buffer: cached, engine: "cache" };
  }

  // 1. Try OpenAI TTS if configured
  if (process.env.OPENAI_API_KEY) {
    const openAiBuffer = await generateOpenAITTS(process.env.OPENAI_API_KEY, clean);
    if (openAiBuffer) {
      if (audioCache.size >= MAX_CACHE_SIZE) {
        const firstKey = audioCache.keys().next().value;
        if (firstKey) audioCache.delete(firstKey);
      }
      audioCache.set(clean, openAiBuffer);
      return { buffer: openAiBuffer, engine: "openai" };
    }
  }

  // 2. High-quality neural Google TTS engine (zero configuration required)
  const chunks = splitIntoChunks(clean);
  const chunkBuffers = await Promise.all(chunks.map((chunk) => fetchGoogleTTS(chunk)));
  const combined = Buffer.concat(chunkBuffers);

  if (audioCache.size >= MAX_CACHE_SIZE) {
    const firstKey = audioCache.keys().next().value;
    if (firstKey) audioCache.delete(firstKey);
  }
  audioCache.set(clean, combined);

  return { buffer: combined, engine: "google-tts" };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const text = searchParams.get("text") || "";

    if (!text.trim()) {
      return NextResponse.json({ error: "Query parameter 'text' is required" }, { status: 400 });
    }

    const { buffer, engine } = await generateAudio(text);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-TTS-Engine": engine,
      },
    });
  } catch (error) {
    console.error("Error generating TTS audio in GET:", error);
    return NextResponse.json({ error: "Failed to synthesize speech" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const text = typeof body?.text === "string" ? body.text : "";

    if (!text.trim()) {
      return NextResponse.json({ error: "Body property 'text' is required" }, { status: 400 });
    }

    const { buffer, engine } = await generateAudio(text);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-TTS-Engine": engine,
      },
    });
  } catch (error) {
    console.error("Error generating TTS audio in POST:", error);
    return NextResponse.json({ error: "Failed to synthesize speech" }, { status: 500 });
  }
}
