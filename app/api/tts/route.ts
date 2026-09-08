import { NextResponse } from "next/server";

import https from "node:https";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// In-memory audio cache for frequent phrases
const audioCache = new Map<string, Buffer>();
const MAX_CACHE_SIZE = 120;

function sanitizeForSpeech(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, "") // strip URLs
    .replace(/<[^>]*>/g, "") // strip HTML tags
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "") // strip emojis
    .replace(/[*_~`#\[\]\(\)\{\}\>\<\+\=\|\\]/g, " ")
    .replace(/^\s*[\d\-\*\•]+\.?\s+/gm, " ") // strip bullet numbers/dashes
    .replace(/\s+/g, " ")
    .trim();
}

function splitIntoChunks(text: string, maxLength = 180): string[] {
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

function fetchGoogleTTS(chunk: string, lang = "en-gb"): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const endpoints = [
      `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
        chunk
      )}&tl=${encodeURIComponent(lang)}&client=tw-ob`,
      `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
        chunk
      )}&tl=${encodeURIComponent(lang)}&client=tw-ob`,
      `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
        chunk
      )}&tl=en&client=tw-ob`,
    ];

    function tryEndpoint(index: number) {
      if (index >= endpoints.length) {
        return reject(new Error("All Google TTS endpoints exhausted"));
      }

      const url = endpoints[index];
      const req = https.get(
        url,
        {
          family: 4, // Force IPv4 to avoid ENETUNREACH / ETIMEDOUT on Node Happy Eyeballs
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            Accept: "audio/mpeg, audio/*;q=0.9, */*;q=0.5",
          },
        },
        (res) => {
          if (res.statusCode !== 200) {
            req.destroy();
            return tryEndpoint(index + 1);
          }

          const data: Buffer[] = [];
          res.on("data", (chunkBuffer: Buffer) => data.push(chunkBuffer));
          res.on("end", () => {
            const combined = Buffer.concat(data);
            if (combined.length > 0) {
              resolve(combined);
            } else {
              tryEndpoint(index + 1);
            }
          });
        }
      );

      req.setTimeout(6500, () => {
        req.destroy();
        tryEndpoint(index + 1);
      });

      req.on("error", () => {
        tryEndpoint(index + 1);
      });
    }

    tryEndpoint(0);
  });
}

async function generateOpenAITTS(apiKey: string, text: string, voiceName?: string): Promise<Buffer | null> {
  const voice = voiceName || process.env.OPENAI_TTS_VOICE || "onyx";
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

function generateEspeakTTS(text: string, voiceOption = "jarvis"): Promise<Buffer | null> {
  return new Promise((resolve) => {
    let espeakVoice = "en-gb";
    let pitch = "50";
    let speed = "150";

    const v = voiceOption.toLowerCase();
    if (v === "friday") {
      espeakVoice = "en-us+f3";
      pitch = "62";
      speed = "155";
    } else if (v === "ultron") {
      espeakVoice = "en-gb+m3";
      pitch = "35";
      speed = "138";
    } else if (v === "jarvis") {
      espeakVoice = "en-gb";
      pitch = "50";
      speed = "148";
    }

    const tmpFile = path.join(os.tmpdir(), `ultron_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.wav`);
    execFile("espeak-ng", ["-w", tmpFile, "-v", espeakVoice, "-p", pitch, "-s", speed, text.slice(0, 800)], (err) => {
      if (err) {
        return resolve(null);
      }
      fs.readFile(tmpFile, (readErr, data) => {
        fs.unlink(tmpFile, () => {});
        if (readErr || !data || data.length === 0) {
          return resolve(null);
        }
        resolve(data);
      });
    });
  });
}

async function generateAudio(text: string, voiceOption = "jarvis"): Promise<{ buffer: Buffer; engine: string; contentType?: string }> {
  const clean = sanitizeForSpeech(text).slice(0, 1000);
  if (!clean) {
    throw new Error("Text is empty after sanitization.");
  }

  const vKey = (voiceOption || "jarvis").toLowerCase().trim();
  const cacheKey = `${vKey}:${clean}`;

  // Check cache
  const cached = audioCache.get(cacheKey);
  if (cached) {
    return { buffer: cached, engine: "cache", contentType: "audio/mpeg" };
  }

  // 1. Try OpenAI TTS if configured
  if (process.env.OPENAI_API_KEY) {
    let openAiVoice = "onyx";
    if (vKey === "friday") openAiVoice = "nova";
    else if (vKey === "jarvis") openAiVoice = "echo";
    else if (vKey === "titan") openAiVoice = "fable";
    else if (["alloy", "echo", "fable", "onyx", "nova", "shimmer"].includes(vKey)) {
      openAiVoice = vKey;
    }

    const openAiBuffer = await generateOpenAITTS(process.env.OPENAI_API_KEY, clean, openAiVoice);
    if (openAiBuffer) {
      if (audioCache.size >= MAX_CACHE_SIZE) {
        const firstKey = audioCache.keys().next().value;
        if (firstKey) audioCache.delete(firstKey);
      }
      audioCache.set(cacheKey, openAiBuffer);
      return { buffer: openAiBuffer, engine: `openai-${openAiVoice}`, contentType: "audio/mpeg" };
    }
  }

  // 2. High-quality neural Google TTS engine with regional persona support
  let googleLang = "en-gb";
  if (vKey === "friday" || vKey === "en-us" || vKey === "us") {
    googleLang = "en-us";
  } else if (vKey === "australian" || vKey === "en-au" || vKey === "au") {
    googleLang = "en-au";
  } else if (vKey === "jarvis" || vKey === "ultron" || vKey === "en-gb" || vKey === "uk") {
    googleLang = "en-gb";
  }

  try {
    const chunks = splitIntoChunks(clean);
    const chunkBuffers = await Promise.all(chunks.map((chunk) => fetchGoogleTTS(chunk, googleLang)));
    const combined = Buffer.concat(chunkBuffers);

    if (audioCache.size >= MAX_CACHE_SIZE) {
      const firstKey = audioCache.keys().next().value;
      if (firstKey) audioCache.delete(firstKey);
    }
    audioCache.set(cacheKey, combined);

    return { buffer: combined, engine: `google-${googleLang}`, contentType: "audio/mpeg" };
  } catch (err) {
    console.warn("Google TTS failed, attempting system espeak-ng fallback:", err);
    // 3. Fallback to system espeak-ng if available
    const espeakBuffer = await generateEspeakTTS(clean, vKey);
    if (espeakBuffer) {
      return { buffer: espeakBuffer, engine: `system-espeak-${vKey}`, contentType: "audio/wav" };
    }
    throw err;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const text = searchParams.get("text") || "";
    const voice = searchParams.get("voice") || "jarvis";

    if (!text.trim()) {
      return NextResponse.json({ error: "Query parameter 'text' is required" }, { status: 400 });
    }

    const { buffer, engine, contentType = "audio/mpeg" } = await generateAudio(text, voice);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
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
    const voice = typeof body?.voice === "string" ? body.voice : "jarvis";

    if (!text.trim()) {
      return NextResponse.json({ error: "Body property 'text' is required" }, { status: 400 });
    }

    const { buffer, engine, contentType = "audio/mpeg" } = await generateAudio(text, voice);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
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
