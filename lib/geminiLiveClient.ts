/**
 * Gemini Live WebSocket Client (Browser-native)
 * Connects directly to Google's real-time multimodal Live API (gemini-3.8-live)
 * via bidirectional WebSocket (BidiGenerateContent) from client code.
 *
 * Streams conversational responses and native 24kHz audio in real time
 * without standard HTTP request-response round-trips.
 */

export type GeminiLiveClientState = "disconnected" | "connecting" | "connected" | "error";

export interface GeminiLiveClientOptions {
  apiKey: string;
  model?: string;
  voiceName?: string;
  systemPrompt?: string;
  endpoint?: string;
  audioContext?: AudioContext | null;
  dspFilterType?: BiquadFilterType;
  dspFilterFreq?: number;
  dspFilterGain?: number;
  dspFilterQ?: number;
  playbackRate?: number;
  onTextChunk?: (chunk: string, fullText: string) => void;
  onAudioChunk?: (pcmData: Uint8Array, audioBuffer: AudioBuffer) => void;
  onTurnComplete?: (fullText: string, audioWavBase64?: string) => void;
  onInterrupted?: () => void;
  onStateChange?: (state: GeminiLiveClientState) => void;
  onError?: (error: Error) => void;
}

/**
 * Standard WAV file header creation for 24kHz 16-bit mono PCM.
 * Browser-native ArrayBuffer implementation with zero Node.js Buffer dependencies.
 */
export function pcmToWav(
  pcmBytes: Uint8Array,
  sampleRate = 24000,
  numChannels = 1,
  bitsPerSample = 16
): ArrayBuffer {
  const dataSize = pcmBytes.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // Helper to write ASCII strings to DataView
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF chunk descriptor
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true); // chunkSize
  writeString(8, "WAVE");

  // "fmt " sub-chunk
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, (sampleRate * numChannels * bitsPerSample) / 8, true); // ByteRate
  view.setUint16(32, (numChannels * bitsPerSample) / 8, true); // BlockAlign
  view.setUint16(34, bitsPerSample, true); // BitsPerSample

  // "data" sub-chunk
  writeString(36, "data");
  view.setUint32(40, dataSize, true); // Subchunk2Size

  // Copy raw PCM sample bytes
  new Uint8Array(buffer, 44).set(pcmBytes);

  return buffer;
}

/**
 * Converts a base64 string to Uint8Array safely in browser environments.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = typeof atob !== "undefined" ? atob(base64) : Buffer.from(base64, "base64").toString("binary");
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Converts a Uint8Array to a base64 string safely in browser environments.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof btoa !== "undefined") {
    let binary = "";
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

/**
 * Converts raw 16-bit linear PCM byte buffer (little-endian) to a Web Audio API AudioBuffer.
 */
export function pcm16ToAudioBuffer(
  pcmBytes: Uint8Array,
  audioCtx: AudioContext,
  sampleRate = 24000
): AudioBuffer {
  const numSamples = Math.floor(pcmBytes.byteLength / 2);
  const dataView = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength);
  const float32Array = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const int16 = dataView.getInt16(i * 2, true); // little-endian
    float32Array[i] = int16 < 0 ? int16 / 32768.0 : int16 / 32767.0;
  }

  const audioBuffer = audioCtx.createBuffer(1, numSamples, sampleRate);
  audioBuffer.getChannelData(0).set(float32Array);
  return audioBuffer;
}

/**
 * Maps persona ID / voice preference to supported Gemini Live voice names.
 */
export function resolveGeminiLiveVoice(voiceKey?: string): string {
  if (!voiceKey) return "Puck";

  const clean = voiceKey.toLowerCase().replace(/^gemini[-:]?/, "").trim();
  const validVoices: Record<string, string> = {
    puck: "Puck",
    charon: "Charon",
    kore: "Kore",
    fenrir: "Fenrir",
    aoede: "Aoede",
    nova: "Nova",
    orion: "Orion",
    capella: "Capella",
    vega: "Vega",
    dipper: "Dipper",
    eclipse: "Eclipse",
    lyra: "Lyra",
    orbit: "Orbit",
    pegasus: "Pegasus",
    ursa: "Ursa",
    // Persona aliases
    jarvis: "Orion",
    ultron: "Fenrir",
    titan: "Orion",
    friday: "Nova",
    cortana: "Aoede",
    edith: "Capella",
    glados: "Aoede",
    hal: "Charon",
    aura: "Capella",
    valkyrie: "Fenrir",
    british: "Orion",
    american: "Puck",
    australian: "Puck",
    irish: "Nova",
    onyx: "Orion",
    echo: "Puck",
    fable: "Orion",
    shimmer: "Capella",
    alloy: "Nova",
  };

  return validVoices[clean] || "Puck";
}

/**
 * GeminiLiveWsClient
 * Manages a persistent bidirectional WebSocket connection to the Gemini Multimodal Live API.
 */
export class GeminiLiveWsClient {
  private ws: WebSocket | null = null;
  private state: GeminiLiveClientState = "disconnected";
  private options: GeminiLiveClientOptions;
  private accumulatedText = "";
  private accumulatedPcmChunks: Uint8Array[] = [];
  private nextPlayTime = 0;
  private activeSourceNodes: AudioBufferSourceNode[] = [];
  private gainNode: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private isExplicitDisconnect = false;
  private currentTurnCompleteResolver: (() => void) | null = null;

  constructor(options: GeminiLiveClientOptions) {
    this.options = { ...options };
  }

  public updateOptions(newOptions: Partial<GeminiLiveClientOptions>) {
    const voiceChanged = newOptions.voiceName && newOptions.voiceName !== this.options.voiceName;
    const modelChanged = newOptions.model && newOptions.model !== this.options.model;
    const keyChanged = newOptions.apiKey && newOptions.apiKey !== this.options.apiKey;

    this.options = { ...this.options, ...newOptions };

    if (keyChanged || modelChanged || voiceChanged) {
      if (this.isConnected()) {
        // Re-establish session with updated parameters
        this.reconnect();
      }
    }
  }

  public getState(): GeminiLiveClientState {
    return this.state;
  }

  public isConnected(): boolean {
    return this.state === "connected" && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private setState(newState: GeminiLiveClientState) {
    if (this.state !== newState) {
      this.state = newState;
      this.options.onStateChange?.(newState);
    }
  }

  /**
   * Connect to the Gemini Multimodal Live API WebSocket protocol.
   */
  public async connect(): Promise<void> {
    if (!this.options.apiKey) {
      console.warn("[GeminiLiveWsClient] Cannot connect: No API key provided.");
      this.setState("disconnected");
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isExplicitDisconnect = false;
    this.setState("connecting");

    const endpoint =
      this.options.endpoint ||
      "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
    const url = `${endpoint}?key=${encodeURIComponent(this.options.apiKey)}`;

    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(url);
        this.ws = ws;

        ws.onopen = () => {
          console.log("[GeminiLiveWsClient] WebSocket connected to Gemini Live API");
          this.reconnectAttempts = 0;
          this.setState("connected");
          this.sendSetup();
          resolve();
        };

        ws.onmessage = async (event: MessageEvent) => {
          await this.handleMessage(event);
        };

        ws.onerror = (err) => {
          console.warn("[GeminiLiveWsClient] WebSocket error:", err);
          this.setState("error");
          this.options.onError?.(new Error("Gemini Live WebSocket encounter an error"));
        };

        ws.onclose = (event: CloseEvent) => {
          console.log(`[GeminiLiveWsClient] WebSocket closed (code ${event.code}): ${event.reason}`);
          this.cleanupPlayback();
          this.ws = null;
          this.setState("disconnected");

          if (!this.isExplicitDisconnect && this.reconnectAttempts < 5) {
            const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 8000);
            this.reconnectAttempts++;
            console.log(`[GeminiLiveWsClient] Scheduling reconnect attempt #${this.reconnectAttempts} in ${delay}ms`);
            this.reconnectTimer = setTimeout(() => {
              void this.connect();
            }, delay);
          }
        };
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error("[GeminiLiveWsClient] Failed to initialize WebSocket:", error);
        this.setState("error");
        this.options.onError?.(error);
        reject(error);
      }
    });
  }

  /**
   * Sends the initial Setup frame required by the Gemini Live API protocol.
   */
  private sendSetup() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const rawModel = this.options.model || "gemini-3.8-live";
    const resolvedModel = rawModel.startsWith("models/") ? rawModel : `models/${rawModel}`;
    const targetVoice = resolveGeminiLiveVoice(this.options.voiceName);

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
          parts: [
            {
              text:
                this.options.systemPrompt ||
                "You are ULTRON, a sophisticated artificial intelligence assistant. Speak directly, calmly, and concisely in 1 to 3 sentences suitable for speech. Never use markdown, bullet points, asterisks, or formatting.",
            },
          ],
        },
        outputAudioTranscription: {},
      },
    };

    console.log("[GeminiLiveWsClient] Transmitting setup frame: voice=", targetVoice, "model=", resolvedModel);
    this.ws.send(JSON.stringify(setupPayload));
  }

  /**
   * Handle incoming WebSocket message according to the Gemini Multimodal Live API protocol.
   */
  private async handleMessage(event: MessageEvent) {
    try {
      let raw = "";
      if (typeof event.data === "string") {
        raw = event.data;
      } else if (event.data instanceof Blob) {
        raw = await event.data.text();
      } else if (event.data instanceof ArrayBuffer) {
        raw = new TextDecoder().decode(event.data);
      }
      if (!raw) return;

      const data = JSON.parse(raw);

      // Handle setup confirmation
      if (data.setupComplete) {
        console.log("[GeminiLiveWsClient] Received setupComplete from Gemini Live API. Protocol handshake ready.");
      }

      // Handle server content chunks
      if (data.serverContent) {
        // 1. Text and Audio parts from modelTurn
        if (data.serverContent.modelTurn?.parts) {
          for (const part of data.serverContent.modelTurn.parts) {
            // Text tokens
            if (typeof part.text === "string" && part.text) {
              this.accumulatedText += part.text;
              this.options.onTextChunk?.(part.text, this.accumulatedText);
            }

            // Native 24kHz PCM audio chunks
            if (part.inlineData?.data) {
              const pcmBytes = base64ToUint8Array(part.inlineData.data);
              this.accumulatedPcmChunks.push(pcmBytes);
              this.streamPcmAudio(pcmBytes);
            }
          }
        }

        // 2. Output audio transcription text
        if (data.serverContent.outputTranscription?.text) {
          const transText = data.serverContent.outputTranscription.text;
          if (!this.accumulatedText.includes(transText)) {
            this.accumulatedText += (this.accumulatedText ? " " : "") + transText;
            this.options.onTextChunk?.(transText, this.accumulatedText);
          }
        }

        // 3. User barge-in interruption detected by server
        if (data.serverContent.interrupted) {
          console.log("[GeminiLiveWsClient] Server signaled turn interrupted (barge-in)");
          this.stopPlayback();
          this.options.onInterrupted?.();
        }

        // 4. Turn completion
        if (data.serverContent.turnComplete) {
          const finalText = this.accumulatedText.trim();
          let wavBase64: string | undefined;

          if (this.accumulatedPcmChunks.length > 0) {
            const totalBytes = this.accumulatedPcmChunks.reduce((acc, c) => acc + c.byteLength, 0);
            const mergedPcm = new Uint8Array(totalBytes);
            let offset = 0;
            for (const chunk of this.accumulatedPcmChunks) {
              mergedPcm.set(chunk, offset);
              offset += chunk.byteLength;
            }
            const wavBuffer = pcmToWav(mergedPcm, 24000);
            wavBase64 = `data:audio/wav;base64,${uint8ArrayToBase64(new Uint8Array(wavBuffer))}`;
          }

          console.log("[GeminiLiveWsClient] Turn complete. Received text length:", finalText.length, "audio chunks:", this.accumulatedPcmChunks.length);
          this.options.onTurnComplete?.(finalText, wavBase64);

          if (this.currentTurnCompleteResolver) {
            this.currentTurnCompleteResolver();
            this.currentTurnCompleteResolver = null;
          }
        }
      }
    } catch (parseErr) {
      console.warn("[GeminiLiveWsClient] Error parsing message:", parseErr);
    }
  }

  /**
   * Plays streamed 24kHz PCM chunks through Web Audio API with sample-accurate scheduling
   * and optional persona DSP filtering.
   */
  private streamPcmAudio(pcmBytes: Uint8Array) {
    const ctx = this.options.audioContext;
    if (!ctx || ctx.state === "closed") return;

    try {
      const audioBuffer = pcm16ToAudioBuffer(pcmBytes, ctx, 24000);
      this.options.onAudioChunk?.(pcmBytes, audioBuffer);

      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      // Calculate effective playback rate
      const effectiveRate = Math.max(0.5, Math.min(2.0, this.options.playbackRate || 1.0));
      source.playbackRate.setValueAtTime(effectiveRate, ctx.currentTime);

      // Create or configure master gain node
      if (!this.gainNode) {
        this.gainNode = ctx.createGain();
        this.gainNode.gain.setValueAtTime(1.35, ctx.currentTime);
        this.gainNode.connect(ctx.destination);
      }

      // Create or configure DSP persona filter
      if (this.options.dspFilterType) {
        if (!this.filterNode) {
          this.filterNode = ctx.createBiquadFilter();
          this.filterNode.type = this.options.dspFilterType;
          if (this.options.dspFilterFreq) {
            this.filterNode.frequency.setValueAtTime(this.options.dspFilterFreq, ctx.currentTime);
          }
          if (this.options.dspFilterGain !== undefined) {
            this.filterNode.gain.setValueAtTime(this.options.dspFilterGain, ctx.currentTime);
          }
          if (this.options.dspFilterQ !== undefined) {
            this.filterNode.Q.setValueAtTime(this.options.dspFilterQ, ctx.currentTime);
          }
          this.filterNode.connect(this.gainNode);
        }
        source.connect(this.filterNode);
      } else {
        source.connect(this.gainNode);
      }

      // Schedule seamless audio playback
      const currentTime = ctx.currentTime;
      const startTime = Math.max(currentTime, this.nextPlayTime);
      source.start(startTime);

      // Duration accounting for playback rate
      const duration = audioBuffer.duration / effectiveRate;
      this.nextPlayTime = startTime + duration;

      this.activeSourceNodes.push(source);
      source.onended = () => {
        const idx = this.activeSourceNodes.indexOf(source);
        if (idx !== -1) {
          this.activeSourceNodes.splice(idx, 1);
        }
      };
    } catch (err) {
      console.warn("[GeminiLiveWsClient] PCM audio streaming error:", err);
    }
  }

  /**
   * Send a user text directive over the Live API WebSocket protocol (`clientContent`).
   */
  public sendUserMessage(
    text: string,
    history?: Array<{ role: "user" | "assistant"; content: string }>
  ): Promise<void> {
    if (!this.isConnected()) {
      throw new Error("Gemini Live WebSocket is not connected.");
    }

    this.stopPlayback();
    this.accumulatedText = "";
    this.accumulatedPcmChunks = [];

    const turns =
      history && history.length > 0
        ? history.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          }))
        : [{ role: "user", parts: [{ text }] }];

    const clientContentPayload = {
      clientContent: {
        turns,
        turnComplete: true,
      },
    };

    console.log("[GeminiLiveWsClient] Sending clientContent turn via WebSocket:", text.slice(0, 60));
    this.ws?.send(JSON.stringify(clientContentPayload));

    return new Promise((resolve) => {
      this.currentTurnCompleteResolver = resolve;
    });
  }

  /**
   * Send raw 16kHz linear PCM microphone audio chunk (`realtimeInput`) over WebSocket.
   */
  public sendRealtimeAudioChunk(pcm16kBase64: string) {
    if (!this.isConnected()) return;

    const payload = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: "audio/pcm;rate=16000",
            data: pcm16kBase64,
          },
        ],
      },
    };

    this.ws?.send(JSON.stringify(payload));
  }

  /**
   * Interrupt current speech and stop all active audio playback nodes.
   */
  public stopPlayback() {
    for (const node of this.activeSourceNodes) {
      try {
        node.stop();
        node.disconnect();
      } catch {}
    }
    this.activeSourceNodes = [];

    if (this.options.audioContext) {
      this.nextPlayTime = this.options.audioContext.currentTime;
    } else {
      this.nextPlayTime = 0;
    }
  }

  /**
   * Update voice persona dynamically and refresh WebSocket setup.
   */
  public updateVoice(voiceName: string) {
    const resolved = resolveGeminiLiveVoice(voiceName);
    if (this.options.voiceName !== resolved) {
      this.options.voiceName = resolved;
      if (this.isConnected()) {
        // Re-send setup or reconnect to apply new voice configuration
        this.reconnect();
      }
    }
  }

  /**
   * Disconnect and clean up resources.
   */
  public disconnect() {
    this.isExplicitDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupPlayback();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.setState("disconnected");
  }

  private reconnect() {
    this.disconnect();
    setTimeout(() => {
      void this.connect();
    }, 200);
  }

  private cleanupPlayback() {
    this.stopPlayback();
    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch {}
      this.gainNode = null;
    }
    if (this.filterNode) {
      try {
        this.filterNode.disconnect();
      } catch {}
      this.filterNode = null;
    }
  }
}
