/**
 * Gemini Live WebSocket and REST Client
 * Integrates Google's real-time multimodal Live API (gemini-3.8-live)
 * to stream conversational responses and native 24kHz audio directly.
 */

export * from "./geminiLiveClient";

export interface GeminiLiveOptions {
  apiKey: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  model?: string;
  voiceName?: string;
  systemPrompt?: string;
  timeoutMs?: number;
}

export interface GeminiLiveResult {
  text: string;
  audioWavBuffer?: Buffer;
  audioBase64?: string;
  provider: string;
  voice: string;
}

import {
  pcmToWav as pcmToWavArrayBuffer,
  resolveGeminiLiveVoice,
} from "./geminiLiveClient";

/**
 * Standard WAV file header creation for 24kHz 16-bit mono PCM from Gemini Live.
 * Supports both Node.js Buffer and browser Uint8Array.
 */
export function pcmToWav(
  pcmBuffer: Buffer | Uint8Array,
  sampleRate = 24000,
  numChannels = 1,
  bitsPerSample = 16
): Buffer {
  const bytes = pcmBuffer instanceof Uint8Array ? pcmBuffer : new Uint8Array(pcmBuffer);
  const ab = pcmToWavArrayBuffer(bytes, sampleRate, numChannels, bitsPerSample);
  return Buffer.from(ab);
}

/**
 * Connects to Gemini Live via bidirectional WebSocket (BidiGenerateContent)
 * on the server side to receive 24kHz audio and text response.
 */
export async function callGeminiLive(options: GeminiLiveOptions): Promise<GeminiLiveResult> {
  const {
    apiKey,
    messages,
    model = process.env.GEMINI_MODEL || "gemini-3.8-live",
    voiceName = resolveGeminiLiveVoice(process.env.GEMINI_VOICE),
    systemPrompt = "You are ULTRON, a sophisticated artificial intelligence assistant. Speak directly, calmly, and concisely in 1 to 3 sentences suitable for speech. Never use markdown, bullet points, asterisks, or formatting.",
    timeoutMs = 15000,
  } = options;

  const resolvedModel = model.startsWith("models/") ? model : `models/${model}`;
  const targetVoice = resolveGeminiLiveVoice(voiceName);

  return new Promise((resolve, reject) => {
    let ws: WebSocket | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let isSettled = false;

    const audioPcmChunks: Buffer[] = [];
    const textChunks: string[] = [];

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (ws) {
        try {
          ws.close();
        } catch {}
        ws = null;
      }
    };

    const settleSuccess = () => {
      if (isSettled) return;
      isSettled = true;
      cleanup();

      const combinedText = textChunks.join("").trim();
      const pcmBuffer = audioPcmChunks.length > 0 ? Buffer.concat(audioPcmChunks) : undefined;
      const wavBuffer = pcmBuffer && pcmBuffer.length > 0 ? pcmToWav(pcmBuffer, 24000) : undefined;
      const audioBase64 = wavBuffer ? `data:audio/wav;base64,${wavBuffer.toString("base64")}` : undefined;

      resolve({
        text: combinedText || "Telemetry received. Systems operational and standing by.",
        audioWavBuffer: wavBuffer,
        audioBase64,
        provider: "gemini-3.8-live",
        voice: targetVoice,
      });
    };

    const settleFailure = (err: Error) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      reject(err);
    };

    timeoutId = setTimeout(() => {
      if (audioPcmChunks.length > 0 || textChunks.length > 0) {
        settleSuccess();
      } else {
        settleFailure(new Error(`Gemini Live connection timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    try {
      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(apiKey)}`;
      ws = new WebSocket(url);

      ws.onopen = () => {
        // 1. Send Setup frame
        const setupPayload = {
          setup: {
            model: resolvedModel,
            generationConfig: {
              responseModalities: ["AUDIO", "TEXT"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: targetVoice,
                  },
                },
              },
            },
            systemInstruction: {
              parts: [{ text: systemPrompt }],
            },
            outputAudioTranscription: {},
          },
        };

        ws?.send(JSON.stringify(setupPayload));

        // 2. Format conversation turns
        const formattedTurns = messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

        // Send conversation history with turnComplete = true
        const clientContentPayload = {
          clientContent: {
            turns: formattedTurns,
            turnComplete: true,
          },
        };

        ws?.send(JSON.stringify(clientContentPayload));
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const raw = typeof event.data === "string" ? event.data : event.data?.toString();
          if (!raw) return;

          const data = JSON.parse(raw);

          // Handle server content chunks
          if (data.serverContent) {
            // Check for model turn parts
            if (data.serverContent.modelTurn?.parts) {
              for (const part of data.serverContent.modelTurn.parts) {
                if (typeof part.text === "string" && part.text) {
                  textChunks.push(part.text);
                }
                if (part.inlineData?.data) {
                  const chunkBuf = Buffer.from(part.inlineData.data, "base64");
                  audioPcmChunks.push(chunkBuf);
                }
              }
            }

            // Check for outputAudioTranscription
            if (data.serverContent.outputTranscription?.text) {
              textChunks.push(data.serverContent.outputTranscription.text);
            }

            // Check if turn complete
            if (data.serverContent.turnComplete) {
              settleSuccess();
            }
          }
        } catch (parseErr) {
          console.warn("[GeminiLive] Message parsing error:", parseErr);
        }
      };

      ws.onerror = (err) => {
        console.warn("[GeminiLive] WebSocket error:", err);
      };

      ws.onclose = (event: CloseEvent) => {
        if (!isSettled) {
          if (audioPcmChunks.length > 0 || textChunks.length > 0) {
            settleSuccess();
          } else {
            const reason = event.reason || `WebSocket closed with code ${event.code}`;
            settleFailure(new Error(`Gemini Live WebSocket closed: ${reason}`));
          }
        }
      };
    } catch (err: unknown) {
      settleFailure(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * Fallback REST content generator using Gemini Flash REST API
 */
export async function callGeminiRest(
  apiKey: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  model = "gemini-3.8-flash",
  systemPrompt = "You are ULTRON, a calm, articulate, concise AI assistant. Respond in 1 to 3 sentences suitable for speech without markdown."
): Promise<string> {
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents,
      generationConfig: {
        maxOutputTokens: 250,
        temperature: 0.7,
      },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Gemini REST API error (${res.status}): ${errorBody}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text || "";
}

/**
 * Synthesizes speech using Gemini Live WebSocket for TTS queries
 */
export async function synthesizeGeminiLiveVoice(
  apiKey: string,
  text: string,
  voiceName = "Puck"
): Promise<Buffer | null> {
  try {
    const resolvedVoice = resolveGeminiLiveVoice(voiceName);
    const result = await callGeminiLive({
      apiKey,
      voiceName: resolvedVoice,
      messages: [
        {
          role: "user",
          content: `Read the following phrase aloud clearly and naturally with no additional commentary:\n"${text}"`,
        },
      ],
      systemPrompt: "You are a speech synthesizer. Read the user's text aloud directly with natural inflection and clear voice timbre.",
      timeoutMs: 12000,
    });

    return result.audioWavBuffer || null;
  } catch (err) {
    console.warn("[GeminiLive] synthesizeGeminiLiveVoice failed:", err);
    return null;
  }
}
