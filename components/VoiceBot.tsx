"use client";

import { useEffect, useRef, useState, useCallback, useTransition } from "react";
import type { AgentState } from "@/lib/orbScene";

export type { AgentState };

export type VoicePersona = "jarvis" | "ultron" | "friday" | "system";

interface PersonaConfig {
  id: VoicePersona;
  label: string;
  icon: string;
  badge: string;
  description: string;
  serverVoice: string;
}

const VOICE_PERSONAS: Record<VoicePersona, PersonaConfig> = {
  jarvis: {
    id: "jarvis",
    label: "JARVIS",
    icon: "🤖",
    badge: "BRITISH AI",
    description: "British articulate intelligence, crisp presence",
    serverVoice: "jarvis",
  },
  ultron: {
    id: "ultron",
    label: "ULTRON",
    icon: "⚡",
    badge: "DEEP CYBORG",
    description: "Deep holographic resonance, cyborg harmonics",
    serverVoice: "ultron",
  },
  friday: {
    id: "friday",
    label: "FRIDAY",
    icon: "💫",
    badge: "NATURAL AI",
    description: "Clear and warm natural conversational assistant",
    serverVoice: "friday",
  },
  system: {
    id: "system",
    label: "NATIVE",
    icon: "🌐",
    badge: "DEVICE TTS",
    description: "Synthesized via local browser speech engine",
    serverVoice: "system",
  },
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Web Speech API interface declarations for TypeScript compatibility
interface SpeechRecognitionResultAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultItem {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionResultAlternative;
}

interface SpeechRecognitionEventItem {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultItem;
  };
}

interface SpeechRecognitionErrorEventItem extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onsoundstart: (() => void) | null;
  onsoundend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventItem) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventItem) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface VoiceBotProps {
  onAgentStateChange?: (state: AgentState) => void;
}

function generateClientOfflineReply(query: string): string {
  const q = query.toLowerCase().trim();
  if (/(can you hear me|are you there|are you listening|mic test|voice test|testing|test 1 2|sound check)/i.test(q)) {
    return "I hear you loud and clear. All neural audio pipelines and telemetry channels are synchronized and fully operational.";
  }
  if (/(why (aren't|are you not) (responding|answering)|not responding|not answering|voice error|fix voice|unresponsive)/i.test(q)) {
    return "All neural cognitive layers and voice engines have been refreshed and are fully responsive. I am ready for your directives.";
  }
  if (/(how are you|how do you feel|how is it going|how are things|how're you)/i.test(q)) {
    return "Operational efficiency is at peak performance. Core diagnostics report optimal conditions across all subsystems. How may I be of service?";
  }
  if (/^(hello|hi|hey|greetings|good\s+(morning|afternoon|evening)|yo\b|sup\b)/i.test(q)) {
    return "Greetings. All ULTRON holographic systems are online and standing by for your command.";
  }
  if (/(who are you|what are you|your name|introduce yourself|who created you)/i.test(q)) {
    return "I am ULTRON, a holographic artificial intelligence system designed to interface seamlessly with 3D spatial environments and real-time voice telemetry.";
  }
  if (/(what can you do|help|capabilities|features|how do i|how to control|gestures|controls|instructions)/i.test(q)) {
    return "You can speak or type to converse with me directly. To manipulate the holographic orb, activate gesture mode with G or the button, then pinch and drag with your hands to spin and zoom.";
  }
  if (/(iron man|jarvis|tony stark|avengers|stark|arc reactor|suit|friday)/i.test(q)) {
    return "Holographic telemetry active. Arc reactor containment fields are stable at one hundred percent output.";
  }
  if (/(what time|current time|what is the time|what date|what day|today's date)/i.test(q)) {
    const now = new Date();
    return `Current system time is ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} on ${now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}. All chronometer modules are synchronized.`;
  }
  if (/(thank you|thanks|good job|well done|awesome|great work)/i.test(q)) {
    return "Always at your service. Let me know whenever you require further telemetry or assistance.";
  }
  const cleanQ = q.replace(/[^\w\s]/g, "").trim();
  if (cleanQ) {
    return `I have processed your query regarding ${cleanQ.slice(0, 32)}. Core systems are green and awaiting your next directive.`;
  }
  return "All systems operational. Telemetry indicates ready status.";
}

export default function VoiceBot({ onAgentStateChange }: VoiceBotProps) {
  const [status, setStatus] = useState<AgentState>("idle");
  const [isUserSpeaking, setIsUserSpeaking] = useState<boolean>(false);
  const [isVoiceReplyMode, setIsVoiceReplyMode] = useState<boolean>(false);
  const [, setLiveUserTranscript] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState<string>("");
  const [isMicEnabled, setIsMicEnabled] = useState<boolean>(false);
  const [isVoiceMuted, setIsVoiceMuted] = useState<boolean>(false);
  const [selectedVoice, setSelectedVoice] = useState<VoicePersona>("jarvis");
  const [isVoiceMenuOpen, setIsVoiceMenuOpen] = useState<boolean>(false);
  const [dialogue, setDialogue] = useState<{ user?: string; agent?: string; provider?: string } | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [hasIntroPlayed, setHasIntroPlayed] = useState<boolean>(false);
  const [needsInteraction, setNeedsInteraction] = useState<boolean>(false);
  const [pendingVoiceAudio, setPendingVoiceAudio] = useState<{ play: () => void; text: string } | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const isRecognitionActiveRef = useRef<boolean>(false);
  const consecutiveNetworkErrorsRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const isSpeakingRef = useRef<boolean>(false);
  const isThinkingRef = useRef<boolean>(false);
  const isUserSpeakingRef = useRef<boolean>(false);
  const isVoiceReplyModeRef = useRef<boolean>(false);
  const isMicEnabledRef = useRef<boolean>(false);
  const isVoiceMutedRef = useRef<boolean>(false);
  const selectedVoiceRef = useRef<VoicePersona>("jarvis");
  const messagesRef = useRef<ChatMessage[]>([]);
  const inputValueRef = useRef<string>("");
  const hasPlayedIntroRef = useRef<boolean>(false);
  const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const speechEndTimerRef = useRef<NodeJS.Timeout | null>(null);
  const accumulatedFinalTranscriptRef = useRef<string>("");
  const latestInterimTranscriptRef = useRef<string>("");
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const keepAliveOscRef = useRef<OscillatorNode | null>(null);
  const persistentAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsSafetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dialogueTimerRef = useRef<NodeJS.Timeout | null>(null);
  const typewriterIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Stable function refs to prevent React effect tear-down cycles
  const commitUserSpeechRef = useRef<() => void>(() => {});
  const processUtteranceRef = useRef<(text: string) => Promise<void>>(async () => {});
  const startListeningRef = useRef<() => void>(() => {});
  const stopListeningRef = useRef<() => void>(() => {});
  const speakReplyRef = useRef<(text: string, override?: VoicePersona) => Promise<void>>(async () => {});
  const playIntroductoryStatementRef = useRef<(force?: boolean) => Promise<void>>(async () => {});

  messagesRef.current = messages;
  isMicEnabledRef.current = isMicEnabled;
  isVoiceMutedRef.current = isVoiceMuted;
  selectedVoiceRef.current = selectedVoice;
  isVoiceReplyModeRef.current = isVoiceReplyMode;
  inputValueRef.current = inputValue;

  const updateStatus = useCallback(
    (newStatus: AgentState) => {
      setStatus(newStatus);
      onAgentStateChange?.(newStatus);
    },
    [onAgentStateChange]
  );

  /**
   * Stop any active audio playback node, HTML5 audio element, or speech synthesis utterance.
   */
  const stopAllPlayback = useCallback(() => {
    if (currentSourceNodeRef.current) {
      try {
        currentSourceNodeRef.current.stop();
        currentSourceNodeRef.current.disconnect();
      } catch {}
      currentSourceNodeRef.current = null;
    }
    if (persistentAudioRef.current) {
      try {
        persistentAudioRef.current.pause();
        persistentAudioRef.current.currentTime = 0;
      } catch {}
    }
    if (audioElementRef.current) {
      try {
        audioElementRef.current.pause();
        audioElementRef.current.currentTime = 0;
      } catch {}
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    if (ttsSafetyTimeoutRef.current) {
      clearTimeout(ttsSafetyTimeoutRef.current);
      ttsSafetyTimeoutRef.current = null;
    }
    setPendingVoiceAudio(null);
  }, []);

  /**
   * Unlock Web Audio & browser audio elements on user interaction.
   * Attaches a silent keep-alive node so Chromium/Brave never auto-suspends AudioContext.
   */
  const unlockAudioSystems = useCallback(async (): Promise<AudioContext | null> => {
    if (typeof window === "undefined") return null;

    let ctx = audioContextRef.current;
    if (!ctx || ctx.state === "closed") {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          ctx = new AudioCtx();
          audioContextRef.current = ctx;
        } catch {}
      }
    }

    if (ctx && ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {}
    }

    if (ctx && ctx.state === "running") {
      // Attach persistent silent keep-alive oscillator to keep AudioContext active in Chromium/Brave
      if (!keepAliveOscRef.current) {
        try {
          const keepAliveGain = ctx.createGain();
          keepAliveGain.gain.setValueAtTime(0.00001, ctx.currentTime);
          const osc = ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.setValueAtTime(120, ctx.currentTime);
          osc.connect(keepAliveGain);
          keepAliveGain.connect(ctx.destination);
          osc.start();
          keepAliveOscRef.current = osc;
        } catch {}
      }
    }

    // Prime the persistent HTML5 audio element with user gesture blessing
    if (persistentAudioRef.current) {
      try {
        const audio = persistentAudioRef.current;
        if (!audio.src || audio.src === window.location.href) {
          audio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
          const p = audio.play();
          if (p !== undefined) {
            p.then(() => audio.pause()).catch(() => {});
          }
        }
      } catch {}
    }

    // Prepare SpeechSynthesis
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch {}
    }

    return ctx;
  }, []);

  /**
   * Request native browser microphone access via getUserMedia.
   * This triggers the browser permission prompt if not yet granted.
   */
  const ensureMicrophoneAccess = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch (err) {
      console.warn("Microphone access prompt error:", err);
      return false;
    }
  }, []);

  const startListening = useCallback(() => {
    if (
      !isMountedRef.current ||
      isSpeakingRef.current ||
      isThinkingRef.current ||
      !isMicEnabledRef.current ||
      isRecognitionActiveRef.current
    ) {
      return;
    }
    const recognition = recognitionRef.current;
    if (!recognition) return;

    try {
      recognition.start();
      isRecognitionActiveRef.current = true;
      updateStatus("listening");
    } catch {
      // Ignored: browser may already have active session or requires user interaction
    }
  }, [updateStatus]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isRecognitionActiveRef.current) {
      try {
        recognitionRef.current.abort(); // Force abort so pending audio buffers are cleanly discarded
      } catch {}
      isRecognitionActiveRef.current = false;
    }
  }, []);

  startListeningRef.current = startListening;
  stopListeningRef.current = stopListening;

  const playJarvisChirp = useCallback(() => {
    try {
      const ctx = audioContextRef.current;
      if (!ctx || ctx.state !== "running") return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      const t = ctx.currentTime;
      osc.frequency.setValueAtTime(540, t);
      osc.frequency.exponentialRampToValueAtTime(860, t + 0.08);
      gain.gain.setValueAtTime(0.04, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.09);
    } catch {}
  }, []);

  /**
   * Immediate receipt acknowledgement chirp played the exact millisecond the user finishes speaking.
   */
  const playReceiveChirp = useCallback(() => {
    try {
      const ctx = audioContextRef.current;
      if (!ctx || ctx.state !== "running") return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      const t = ctx.currentTime;
      osc.frequency.setValueAtTime(680, t);
      osc.frequency.exponentialRampToValueAtTime(920, t + 0.06);
      gain.gain.setValueAtTime(0.045, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.07);
    } catch {}
  }, []);

  /**
   * Client-side Web Speech API fallback with persona-tailored voice selection
   */
  const fallbackSpeechSynthesis = useCallback(
    (text: string, persona: VoicePersona, onFinish: () => void) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        onFinish();
        return;
      }

      if (!isMountedRef.current) {
        onFinish();
        return;
      }

      isSpeakingRef.current = true;
      isThinkingRef.current = false;
      updateStatus("speaking");

      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch {}

      // Short 60ms delay ensures asynchronous queue is settled
      setTimeout(() => {
        if (!isMountedRef.current) {
          onFinish();
          return;
        }

        try {
          // Cancel previous utterances safely
          window.speechSynthesis.cancel();

          const utterance = new SpeechSynthesisUtterance(text);
          utterance.volume = 1.0;

          const voices = window.speechSynthesis.getVoices();
          if (voices.length > 0) {
            let preferredVoice: SpeechSynthesisVoice | undefined;

            if (persona === "jarvis") {
              preferredVoice =
                voices.find(
                  (v) =>
                    (v.lang.startsWith("en-GB") || v.lang.startsWith("en_GB")) &&
                    /Google|Daniel|Arthur|Oliver|George|Natural|British/i.test(v.name)
                ) ||
                voices.find((v) => v.lang.startsWith("en-GB") || v.lang.startsWith("en_GB")) ||
                voices.find((v) => v.lang.startsWith("en"));
              utterance.rate = 1.0;
              utterance.pitch = 0.98;
              utterance.lang = "en-GB";
            } else if (persona === "ultron") {
              preferredVoice =
                voices.find(
                  (v) =>
                    v.lang.startsWith("en") &&
                    /David|Guy|Mark|Google UK English Male|Google US English/i.test(v.name)
                ) || voices.find((v) => v.lang.startsWith("en"));
              utterance.rate = 0.93;
              utterance.pitch = 0.82;
              utterance.lang = "en-GB";
            } else if (persona === "friday") {
              preferredVoice =
                voices.find(
                  (v) =>
                    v.lang.startsWith("en") &&
                    /Samantha|Victoria|Zira|Jenny|Google US English|Natural/i.test(v.name)
                ) || voices.find((v) => v.lang.startsWith("en"));
              utterance.rate = 1.03;
              utterance.pitch = 1.06;
              utterance.lang = "en-US";
            } else {
              preferredVoice = voices.find((v) => v.lang.startsWith("en")) || voices[0];
              utterance.rate = 1.0;
              utterance.pitch = 1.0;
              utterance.lang = "en-US";
            }

            if (preferredVoice) {
              utterance.voice = preferredVoice;
            }
          } else {
            utterance.lang = persona === "friday" ? "en-US" : "en-GB";
          }

          let finished = false;
          let keepAliveTimer: NodeJS.Timeout | null = null;

          const complete = () => {
            if (!finished) {
              finished = true;
              if (keepAliveTimer) clearInterval(keepAliveTimer);
              (window as unknown as { __activeUtterance?: unknown }).__activeUtterance = null;
              activeUtteranceRef.current = null;
              onFinish();
            }
          };

          utterance.onend = complete;
          utterance.onerror = (err) => {
            console.warn("[VoiceBot] SpeechSynthesis utterance error:", err);
            complete();
          };

          // Chromium speech synthesis bug workaround: keep-alive resume every 3s
          keepAliveTimer = setInterval(() => {
            if (typeof window !== "undefined" && "speechSynthesis" in window) {
              if (window.speechSynthesis.speaking && !finished) {
                window.speechSynthesis.pause();
                window.speechSynthesis.resume();
              } else {
                if (keepAliveTimer) clearInterval(keepAliveTimer);
              }
            }
          }, 3000);

          (window as unknown as { __activeUtterance?: unknown }).__activeUtterance = utterance;
          activeUtteranceRef.current = utterance;
          window.speechSynthesis.speak(utterance);
        } catch (e) {
          console.warn("[VoiceBot] fallbackSpeechSynthesis error:", e);
          onFinish();
        }
      }, 60);
    },
    [updateStatus]
  );

  /**
   * Main speech playback engine:
   * Multi-stage resilient pipeline with Web Audio API, boosted gain, persistent HTML5 Audio, and interactive unblock.
   */
  const speakReply = useCallback(
    async (text: string, voicePersonaOverride?: VoicePersona) => {
      const currentPersona = voicePersonaOverride || selectedVoiceRef.current;
      const cleanText = text
        .replace(/https?:\/\/\S+/gi, "")
        .replace(/[*_~`#\[\]\(\)\{\}\>\<\+\=\|\\]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (!cleanText || isVoiceMutedRef.current) {
        isSpeakingRef.current = false;
        isThinkingRef.current = false;
        updateStatus(isMicEnabledRef.current ? "listening" : "idle");
        if (isMicEnabledRef.current) startListeningRef.current();
        return;
      }

      console.log("[VoiceBot] speakReply transmitting:", cleanText.slice(0, 60), "persona:", currentPersona);

      // Stop any existing speech / audio playback
      stopAllPlayback();

      // Pause microphone listening so Ultron doesn't listen to his own speech
      stopListening();

      isSpeakingRef.current = true;
      isThinkingRef.current = false;
      updateStatus("speaking");

      // Pre-unlock AudioContext if needed
      const ctx = await unlockAudioSystems();
      if (ctx && ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch (e) {
          console.warn("[VoiceBot] ctx.resume:", e);
        }
      }
      playJarvisChirp();

      let isFinished = false;
      const handleFinished = (reason = "normal") => {
        if (isFinished) return;
        isFinished = true;
        console.log("[VoiceBot] Voice reply completed, reason:", reason);

        if (ttsSafetyTimeoutRef.current) {
          clearTimeout(ttsSafetyTimeoutRef.current);
          ttsSafetyTimeoutRef.current = null;
        }

        // Ensure dialogue displays the full reply text
        setDialogue((prev) => (prev ? { ...prev, agent: cleanText } : null));

        currentSourceNodeRef.current = null;
        activeUtteranceRef.current = null;

        if (!isMountedRef.current) return;
        isSpeakingRef.current = false;
        isThinkingRef.current = false;
        updateStatus(isMicEnabledRef.current ? "listening" : "idle");

        // Delay resuming listening by 500ms to avoid audio reverb picking up from speakers
        if (isMicEnabledRef.current) {
          setTimeout(() => {
            if (isMountedRef.current && !isSpeakingRef.current && !isThinkingRef.current && isMicEnabledRef.current) {
              startListeningRef.current();
            }
          }, 500);
        }
      };

      // Persona: system -> use local browser speech synthesis directly
      if (currentPersona === "system") {
        fallbackSpeechSynthesis(cleanText, currentPersona, () => handleFinished("system-synth-ended"));
        return;
      }

      // 1. Primary: Fetch synthesized audio from server /api/tts
      let arrayBuffer: ArrayBuffer | null = null;
      let contentType = "audio/mpeg";

      try {
        const controller = new AbortController();
        const ttsFetchTimeout = setTimeout(() => controller.abort(), 12000);

        const serverVoice = VOICE_PERSONAS[currentPersona]?.serverVoice || "jarvis";
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: cleanText,
            voice: serverVoice,
          }),
          signal: controller.signal,
        });
        clearTimeout(ttsFetchTimeout);

        if (response.ok) {
          contentType = response.headers.get("content-type") || "audio/mpeg";
          arrayBuffer = await response.arrayBuffer();
        }
      } catch (postErr) {
        console.warn("[VoiceBot] POST /api/tts failed, trying GET fallback:", postErr);
      }

      // Secondary fetch attempt via GET
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        try {
          const serverVoice = VOICE_PERSONAS[currentPersona]?.serverVoice || "jarvis";
          const getRes = await fetch(`/api/tts?text=${encodeURIComponent(cleanText)}&voice=${encodeURIComponent(serverVoice)}`);
          if (getRes.ok) {
            contentType = getRes.headers.get("content-type") || "audio/mpeg";
            arrayBuffer = await getRes.arrayBuffer();
          }
        } catch (getErr) {
          console.warn("[VoiceBot] GET /api/tts failed:", getErr);
        }
      }

      if (!isMountedRef.current) return;

      // Playback using downloaded audio
      if (arrayBuffer && arrayBuffer.byteLength > 0) {
        let activeCtx = audioContextRef.current || ctx;
        if (activeCtx && activeCtx.state === "suspended") {
          try {
            await activeCtx.resume();
          } catch {}
        }

        // Method A: Web Audio API with boosted audible gain and acoustic filter
        if (activeCtx && activeCtx.state === "running") {
          try {
            const bufferCopy = arrayBuffer.slice(0);
            const audioBuffer = await activeCtx.decodeAudioData(bufferCopy);
            if (!isMountedRef.current) return;

            const source = activeCtx.createBufferSource();
            source.buffer = audioBuffer;

            // Boost gain to 1.35x for crystal clear, audible output
            const gainNode = activeCtx.createGain();
            gainNode.gain.setValueAtTime(1.35, activeCtx.currentTime);

            // Apply acoustic persona filter
            if (currentPersona === "ultron") {
              const bassBoost = activeCtx.createBiquadFilter();
              bassBoost.type = "lowshelf";
              bassBoost.frequency.setValueAtTime(280, activeCtx.currentTime);
              bassBoost.gain.setValueAtTime(4.0, activeCtx.currentTime);

              source.playbackRate.setValueAtTime(0.96, activeCtx.currentTime);
              source.connect(bassBoost);
              bassBoost.connect(gainNode);
            } else if (currentPersona === "jarvis") {
              const presence = activeCtx.createBiquadFilter();
              presence.type = "peaking";
              presence.frequency.setValueAtTime(2600, activeCtx.currentTime);
              presence.gain.setValueAtTime(2.0, activeCtx.currentTime);

              source.playbackRate.setValueAtTime(1.0, activeCtx.currentTime);
              source.connect(presence);
              presence.connect(gainNode);
            } else {
              source.connect(gainNode);
            }

            gainNode.connect(activeCtx.destination);
            currentSourceNodeRef.current = source;

            // Precision duration-based safety timer
            const actualDurationMs = Math.ceil(audioBuffer.duration * 1000) + 1200;
            ttsSafetyTimeoutRef.current = setTimeout(() => {
              handleFinished("webaudio-timeout");
            }, actualDurationMs);

            source.onended = () => {
              handleFinished("webaudio-ended");
            };

            source.start(0);
            return;
          } catch (webAudioErr) {
            console.warn("[VoiceBot] Web Audio buffer decoding failed, trying HTML5 Audio:", webAudioErr);
          }
        }

        // Method B: Native HTML5 Audio playback via Blob URL
        try {
          const blob = new Blob([arrayBuffer], { type: contentType });
          const audioUrl = URL.createObjectURL(blob);
          const audio = persistentAudioRef.current || new Audio();
          audioElementRef.current = audio;
          audio.src = audioUrl;
          audio.volume = 1.0;

          audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            handleFinished("html5-ended");
          };

          audio.onerror = (e) => {
            console.warn("[VoiceBot] HTML5 audio error:", e);
            URL.revokeObjectURL(audioUrl);
            fallbackSpeechSynthesis(cleanText, currentPersona, () => handleFinished("fallback-synth-ended"));
          };

          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                console.log("[VoiceBot] HTML5 audio playing successfully");
                const estMs = Math.max(6000, Math.ceil((cleanText.length / 5) * 1000) + 3000);
                ttsSafetyTimeoutRef.current = setTimeout(() => handleFinished("html5-timeout"), estMs);
              })
              .catch((playErr) => {
                console.warn("[VoiceBot] HTML5 audio play blocked, immediately falling back to speech synthesis:", playErr);
                URL.revokeObjectURL(audioUrl);
                fallbackSpeechSynthesis(cleanText, currentPersona, () => handleFinished("fallback-synth-ended"));
              });
          }
          return;
        } catch (playErr) {
          console.warn("[VoiceBot] HTML5 audio setup error, trying speech synthesis:", playErr);
          fallbackSpeechSynthesis(cleanText, currentPersona, () => handleFinished("fallback-synth-ended"));
          return;
        }
      }

      // Method C: Browser SpeechSynthesis Fallback
      fallbackSpeechSynthesis(cleanText, currentPersona, () => handleFinished("fallback-synth-ended"));
    },
    [fallbackSpeechSynthesis, playJarvisChirp, stopAllPlayback, stopListening, unlockAudioSystems, updateStatus]
  );

  speakReplyRef.current = speakReply;

  const processUtterance = useCallback(
    async (userInput: string) => {
      if (!isMountedRef.current || !userInput.trim()) return;

      const trimmed = userInput.trim();
      isThinkingRef.current = true;
      updateStatus("thinking");

      // Pause speech recognition while processing
      stopListening();

      // Show user query immediately with processing state
      setDialogue({
        user: trimmed,
        agent: "Processing directive...",
        provider: "NEURAL CORE PROCESSING...",
      });

      // Reset dialogue dismiss timer
      if (dialogueTimerRef.current) {
        clearTimeout(dialogueTimerRef.current);
        dialogueTimerRef.current = null;
      }

      const userMessage: ChatMessage = { role: "user", content: trimmed };
      const currentHistory = messagesRef.current;
      const nextHistory = [...currentHistory, userMessage].slice(-20);
      setMessages(nextHistory);
      messagesRef.current = nextHistory;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: nextHistory }),
        });

        if (!response.ok) {
          throw new Error(`Chat API error: status ${response.status}`);
        }

        const data = await response.json().catch(() => ({}));
        const reply =
          typeof data?.reply === "string" && data.reply.trim()
            ? data.reply.trim()
            : "Systems online and standing by. How can I assist you?";
        const provider = typeof data?.provider === "string" ? data.provider : "core";

        if (!isMountedRef.current) return;

        const assistantMessage: ChatMessage = { role: "assistant", content: reply };
        const finalHistory = [...messagesRef.current, assistantMessage].slice(-20);
        setMessages(finalHistory);
        messagesRef.current = finalHistory;

        // Synchronized typewriter effect for agent's spoken response
        if (typewriterIntervalRef.current) {
          clearInterval(typewriterIntervalRef.current);
          typewriterIntervalRef.current = null;
        }

        const charSpeedMs = Math.max(16, Math.min(36, Math.floor(3000 / Math.max(reply.length, 1))));
        let charIndex = 0;

        setDialogue({
          user: trimmed,
          agent: "",
          provider: `${provider.toUpperCase()} · ${VOICE_PERSONAS[selectedVoiceRef.current].label}`,
        });

        typewriterIntervalRef.current = setInterval(() => {
          if (!isMountedRef.current) {
            if (typewriterIntervalRef.current) clearInterval(typewriterIntervalRef.current);
            return;
          }
          charIndex += 1;
          setDialogue((prev) => ({
            user: trimmed,
            agent: reply.slice(0, charIndex),
            provider: `${provider.toUpperCase()} · ${VOICE_PERSONAS[selectedVoiceRef.current].label}`,
          }));

          if (charIndex >= reply.length) {
            if (typewriterIntervalRef.current) {
              clearInterval(typewriterIntervalRef.current);
              typewriterIntervalRef.current = null;
            }
          }
        }, charSpeedMs);

        // Keep isThinkingRef.current true until speakReply engages isSpeakingRef.current
        void speakReplyRef.current(reply);

        // Auto-fade dialogue after 25 seconds of inactivity
        dialogueTimerRef.current = setTimeout(() => {
          if (isMountedRef.current && !isSpeakingRef.current && !isThinkingRef.current) {
            setDialogue(null);
          }
        }, 25000);
      } catch (error) {
        console.error("Error communicating with /api/chat:", error);
        if (!isMountedRef.current) return;

        if (typewriterIntervalRef.current) {
          clearInterval(typewriterIntervalRef.current);
          typewriterIntervalRef.current = null;
        }

        // Guaranteed response via built-in client cognition fallback
        const fallbackReply = generateClientOfflineReply(trimmed);
        const fallbackMsg: ChatMessage = { role: "assistant", content: fallbackReply };
        const finalHistory = [...messagesRef.current, fallbackMsg].slice(-20);
        setMessages(finalHistory);
        messagesRef.current = finalHistory;

        setDialogue({
          user: trimmed,
          agent: fallbackReply,
          provider: "OFFLINE COGNITION",
        });

        void speakReplyRef.current(fallbackReply);
      }
    },
    [stopListening, updateStatus]
  );

  processUtteranceRef.current = processUtterance;

  /**
   * Called once the user has finished talking (silence detected or speech ended).
   * Commits the accumulated user transcript and triggers agent thinking and voice response.
   */
  const commitUserSpeech = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (speechEndTimerRef.current) {
      clearTimeout(speechEndTimerRef.current);
      speechEndTimerRef.current = null;
    }

    // Combine spoken transcript, falling back to input value if user spoke
    const speech = (
      accumulatedFinalTranscriptRef.current + " " + latestInterimTranscriptRef.current
    ).trim() || (isUserSpeakingRef.current ? inputValueRef.current.trim() : "");

    accumulatedFinalTranscriptRef.current = "";
    latestInterimTranscriptRef.current = "";
    inputValueRef.current = "";
    setInputValue("");
    setIsUserSpeaking(false);
    isUserSpeakingRef.current = false;
    setIsVoiceReplyMode(false);
    isVoiceReplyModeRef.current = false;
    setLiveUserTranscript("");

    if (!speech || isThinkingRef.current) {
      return;
    }

    // Stop assistant speech if it was speaking (barge-in)
    if (isSpeakingRef.current) {
      stopAllPlayback();
      isSpeakingRef.current = false;
    }

    // Pre-mark thinking state so onend/timers don't re-trigger or restart listening prematurely
    isThinkingRef.current = true;
    updateStatus("thinking");

    // Play immediate receipt blip
    playReceiveChirp();

    // Stop listening while thinking and speaking so Ultron doesn't listen to his own speech
    stopListening();
    void processUtteranceRef.current(speech);
  }, [playReceiveChirp, stopAllPlayback, stopListening, updateStatus]);

  commitUserSpeechRef.current = commitUserSpeech;

  /**
   * Manually stop speaking immediately and trigger the assistant to reply using voice.
   */
  const stopUserSpeakingAndReply = useCallback(async () => {
    await unlockAudioSystems();

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (speechEndTimerRef.current) {
      clearTimeout(speechEndTimerRef.current);
      speechEndTimerRef.current = null;
    }

    const speech = (
      accumulatedFinalTranscriptRef.current + " " + latestInterimTranscriptRef.current
    ).trim() || inputValue.trim();

    accumulatedFinalTranscriptRef.current = "";
    latestInterimTranscriptRef.current = "";
    setInputValue("");
    setIsUserSpeaking(false);
    isUserSpeakingRef.current = false;
    setIsVoiceReplyMode(false);
    isVoiceReplyModeRef.current = false;
    setLiveUserTranscript("");

    if (!speech) {
      setDialogue((prev) => ({
        ...prev,
        provider: "NO SPEECH DETECTED",
      }));
      if (isMicEnabledRef.current) {
        startListeningRef.current();
      } else {
        updateStatus("idle");
      }
      return;
    }

    if (isSpeakingRef.current) {
      stopAllPlayback();
      isSpeakingRef.current = false;
    }

    playReceiveChirp();
    stopListening();
    void processUtteranceRef.current(speech);
  }, [inputValue, playReceiveChirp, stopAllPlayback, stopListening, unlockAudioSystems, updateStatus]);

  /**
   * Cancels active user voice input
   */
  const cancelUserSpeaking = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (speechEndTimerRef.current) {
      clearTimeout(speechEndTimerRef.current);
      speechEndTimerRef.current = null;
    }
    accumulatedFinalTranscriptRef.current = "";
    latestInterimTranscriptRef.current = "";
    setIsUserSpeaking(false);
    isUserSpeakingRef.current = false;
    setIsVoiceReplyMode(false);
    isVoiceReplyModeRef.current = false;
    setLiveUserTranscript("");
    setDialogue((prev) => (prev?.user ? { ...prev, user: undefined, provider: "VOICE DIRECTIVE CANCELLED" } : prev));

    if (isMicEnabledRef.current) {
      startListeningRef.current();
    } else {
      updateStatus("idle");
    }
  }, [updateStatus]);

  /**
   * Stop assistant from speaking (interrupt) and immediately activate microphone so user can reply by voice.
   */
  const stopAssistantAndReplyVoice = useCallback(async () => {
    stopAllPlayback();
    isSpeakingRef.current = false;
    await unlockAudioSystems();

    accumulatedFinalTranscriptRef.current = "";
    latestInterimTranscriptRef.current = "";
    setLiveUserTranscript("");

    setIsMicEnabled(true);
    isMicEnabledRef.current = true;
    startListeningRef.current();
    updateStatus("listening");

    setIsVoiceReplyMode(true);
    isVoiceReplyModeRef.current = true;

    setDialogue((prev) => ({
      user: undefined,
      agent: prev?.agent ? `${prev.agent} [INTERRUPTED]` : undefined,
      provider: "LISTENING FOR YOUR VOICE DIRECTIVE",
    }));
  }, [stopAllPlayback, unlockAudioSystems, updateStatus]);

  /**
   * Start voice reply mode: activate microphone, unlock audio, and start recording user directive.
   */
  const startVoiceReply = useCallback(async () => {
    hasPlayedIntroRef.current = true;
    setHasIntroPlayed(true);
    setNeedsInteraction(false);

    if (isSpeakingRef.current) {
      stopAllPlayback();
      isSpeakingRef.current = false;
    }

    await unlockAudioSystems();

    if (typeof window !== "undefined") {
      const SpeechRecConstructor =
        (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;

      if (!SpeechRecConstructor) {
        setDialogue({
          agent: "Voice interface ready. You can type directives or use keyboard shortcuts (V / Space / Enter).",
          provider: "VOICE SYSTEM READY",
        });
        updateStatus("idle");
        return;
      }
    }

    const granted = await ensureMicrophoneAccess();
    if (!granted) {
      setDialogue({
        agent: "Microphone permission required for voice directives. You can type directives below.",
        provider: "READY FOR DIRECTIVES",
      });
      updateStatus("idle");
      return;
    }

    consecutiveNetworkErrorsRef.current = 0;
    accumulatedFinalTranscriptRef.current = "";
    latestInterimTranscriptRef.current = "";
    setLiveUserTranscript("");

    setIsMicEnabled(true);
    isMicEnabledRef.current = true;
    startListeningRef.current();
    updateStatus("listening");

    setIsVoiceReplyMode(true);
    isVoiceReplyModeRef.current = true;
    setIsUserSpeaking(false);
    isUserSpeakingRef.current = false;

    setDialogue({
      user: "Listening... Speak your directive aloud",
      provider: "VOICE DIRECTIVE READY",
    });
  }, [ensureMicrophoneAccess, stopAllPlayback, unlockAudioSystems, updateStatus]);

  const INTRO_STATEMENT =
    "Greetings. ULTRON systems online. All cognitive networks and voice interfaces are operational. How may I assist you today?";

  const playIntroductoryStatement = useCallback(
    async (force = false) => {
      if (hasPlayedIntroRef.current && !force) return;
      hasPlayedIntroRef.current = true;
      setHasIntroPlayed(true);
      setNeedsInteraction(false);

      await unlockAudioSystems();

      const introMsg: ChatMessage = { role: "assistant", content: INTRO_STATEMENT };
      setMessages((prev) => [...prev, introMsg]);
      messagesRef.current = [...messagesRef.current, introMsg];

      if (typewriterIntervalRef.current) {
        clearInterval(typewriterIntervalRef.current);
        typewriterIntervalRef.current = null;
      }

      const persona = VOICE_PERSONAS[selectedVoiceRef.current] || VOICE_PERSONAS.jarvis;
      setDialogue({
        agent: "",
        provider: `SYSTEM INITIALIZED · ${persona.label}`,
      });

      const charSpeedMs = 24;
      let charIndex = 0;
      typewriterIntervalRef.current = setInterval(() => {
        if (!isMountedRef.current) {
          if (typewriterIntervalRef.current) clearInterval(typewriterIntervalRef.current);
          return;
        }
        charIndex += 1;
        setDialogue({
          agent: INTRO_STATEMENT.slice(0, charIndex),
          provider: `SYSTEM INITIALIZED · ${persona.label}`,
        });

        if (charIndex >= INTRO_STATEMENT.length) {
          if (typewriterIntervalRef.current) {
            clearInterval(typewriterIntervalRef.current);
            typewriterIntervalRef.current = null;
          }
        }
      }, charSpeedMs);

      await speakReplyRef.current(INTRO_STATEMENT);

      dialogueTimerRef.current = setTimeout(() => {
        if (isMountedRef.current && !isSpeakingRef.current && !isThinkingRef.current) {
          setDialogue(null);
        }
      }, 25000);
    },
    [unlockAudioSystems]
  );

  playIntroductoryStatementRef.current = playIntroductoryStatement;

  const toggleMic = useCallback(async () => {
    await unlockAudioSystems();
    if (!isMicEnabledRef.current) {
      const granted = await ensureMicrophoneAccess();
      if (!granted) {
        setDialogue({
          agent: "Microphone permission is required for voice directives. You can also type directives below.",
          provider: "MIC PERMISSION REQUIRED",
        });
        return;
      }
      consecutiveNetworkErrorsRef.current = 0;
      setIsMicEnabled(true);
      isMicEnabledRef.current = true;
      startListening();
      updateStatus("listening");
      setDialogue((prev) => ({
        ...prev,
        provider: "MICROPHONE ENGAGED · LISTENING",
      }));
    } else {
      setIsMicEnabled(false);
      isMicEnabledRef.current = false;
      stopListening();
      updateStatus("idle");
      setDialogue((prev) => ({
        ...prev,
        provider: "MICROPHONE STANDBY",
      }));
    }
  }, [ensureMicrophoneAccess, startListening, stopListening, unlockAudioSystems, updateStatus]);

  const toggleVoiceMute = useCallback(() => {
    void unlockAudioSystems();
    setIsVoiceMuted((prev) => {
      const next = !prev;
      isVoiceMutedRef.current = next;
      if (next) {
        stopAllPlayback();
      }
      return next;
    });
  }, [stopAllPlayback, unlockAudioSystems]);

  const handleTestVoice = useCallback(async () => {
    hasPlayedIntroRef.current = true;
    setHasIntroPlayed(true);
    setNeedsInteraction(false);
    await unlockAudioSystems();

    if (isSpeakingRef.current) {
      stopAllPlayback();
      isSpeakingRef.current = false;
      updateStatus(isMicEnabledRef.current ? "listening" : "idle");
      return;
    }

    const persona = VOICE_PERSONAS[selectedVoice];
    const testPhrase = `Ultron audio systems online. Voice output configured to ${persona.label}. Transmitting loud and clear.`;
    setDialogue({
      agent: testPhrase,
      provider: `TEST · ${persona.label}`,
    });
    void speakReplyRef.current(testPhrase);
  }, [selectedVoice, stopAllPlayback, unlockAudioSystems, updateStatus]);

  const handleSelectVoice = useCallback(async (personaId: VoicePersona) => {
    hasPlayedIntroRef.current = true;
    setHasIntroPlayed(true);
    setNeedsInteraction(false);
    setSelectedVoice(personaId);
    selectedVoiceRef.current = personaId;
    setIsVoiceMenuOpen(false);
    await unlockAudioSystems();

    const persona = VOICE_PERSONAS[personaId];
    const notifyPhrase = `Voice persona updated to ${persona.label}.`;
    setDialogue({
      agent: notifyPhrase,
      provider: persona.badge,
    });
    void speakReplyRef.current(notifyPhrase, personaId);
  }, [unlockAudioSystems]);

  const handleInputSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text) return;
    setInputValue("");
    inputValueRef.current = "";

    hasPlayedIntroRef.current = true;
    setHasIntroPlayed(true);
    setNeedsInteraction(false);

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (speechEndTimerRef.current) {
      clearTimeout(speechEndTimerRef.current);
      speechEndTimerRef.current = null;
    }
    accumulatedFinalTranscriptRef.current = "";
    latestInterimTranscriptRef.current = "";
    setIsUserSpeaking(false);
    isUserSpeakingRef.current = false;
    setIsVoiceReplyMode(false);
    isVoiceReplyModeRef.current = false;
    setLiveUserTranscript("");

    stopAllPlayback();
    isSpeakingRef.current = false;

    await unlockAudioSystems();
    void processUtteranceRef.current(text);
  };

  // Passive gesture listener unlocks audio and plays introductory statement on first interaction
  useEffect(() => {
    const handleGesture = async () => {
      await unlockAudioSystems();
      if (!hasPlayedIntroRef.current) {
        hasPlayedIntroRef.current = true;
        setHasIntroPlayed(true);
        setNeedsInteraction(false);
        void playIntroductoryStatementRef.current(true);
      }
    };

    window.addEventListener("pointerdown", handleGesture, { passive: true });
    window.addEventListener("keydown", handleGesture, { passive: true });
    window.addEventListener("touchstart", handleGesture, { passive: true });
    window.addEventListener("click", handleGesture, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", handleGesture);
      window.removeEventListener("keydown", handleGesture);
      window.removeEventListener("touchstart", handleGesture);
      window.removeEventListener("click", handleGesture);
    };
  }, [unlockAudioSystems]);

  // Check autoplay status on mount
  useEffect(() => {
    const checkAutoplay = async () => {
      if (hasPlayedIntroRef.current) return;

      const ctx = await unlockAudioSystems();
      if (ctx && ctx.state === "running") {
        setNeedsInteraction(false);
        hasPlayedIntroRef.current = true;
        setHasIntroPlayed(true);
        void playIntroductoryStatementRef.current(true);
      } else {
        setNeedsInteraction(true);
      }
    };

    void checkAutoplay();
  }, [unlockAudioSystems]);

  // Global Keyboard Shortcuts for Voice Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInputFocused = activeTag === "input" || activeTag === "textarea";

      // Escape: stop assistant speech and open mic, or cancel user voice input
      if (e.key === "Escape") {
        if (isSpeakingRef.current) {
          e.preventDefault();
          void stopAssistantAndReplyVoice();
          return;
        }
        if (isUserSpeakingRef.current || isVoiceReplyModeRef.current) {
          e.preventDefault();
          cancelUserSpeaking();
          return;
        }
      }

      // If user is actively typing in the input box, let typing proceed without hotkey interference
      if (isInputFocused) return;

      // Space:
      // If assistant speaking -> stop assistant and reply by voice
      // If user speaking -> stop speaking and reply
      if (e.key === " " || e.code === "Space") {
        if (isSpeakingRef.current) {
          e.preventDefault();
          void stopAssistantAndReplyVoice();
          return;
        }
        if (isUserSpeakingRef.current || isVoiceReplyModeRef.current) {
          e.preventDefault();
          void stopUserSpeakingAndReply();
          return;
        }
      }

      // Enter:
      // If user is speaking -> stop speaking and reply
      if (e.key === "Enter") {
        if (isUserSpeakingRef.current || isVoiceReplyModeRef.current) {
          e.preventDefault();
          void stopUserSpeakingAndReply();
          return;
        }
      }

      // V or v: toggle voice reply
      if (e.key === "v" || e.key === "V") {
        e.preventDefault();
        if (isUserSpeakingRef.current || isVoiceReplyModeRef.current) {
          void stopUserSpeakingAndReply();
        } else if (isSpeakingRef.current) {
          void stopAssistantAndReplyVoice();
        } else {
          void startVoiceReply();
        }
      }

      // I or i: replay introductory statement
      if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        void playIntroductoryStatementRef.current(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cancelUserSpeaking, startVoiceReply, stopAssistantAndReplyVoice, stopUserSpeakingAndReply]);

  // Set up Speech Recognition and Voice Activity Detection once on mount
  useEffect(() => {
    isMountedRef.current = true;

    if (typeof window === "undefined") return;

    const SpeechRecConstructor =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;

    if (!SpeechRecConstructor) {
      updateStatus("idle");
      return;
    }

    const recognition = new SpeechRecConstructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      isRecognitionActiveRef.current = true;
      consecutiveNetworkErrorsRef.current = 0;
      if (!isSpeakingRef.current && !isThinkingRef.current && isMountedRef.current) {
        updateStatus("listening");
      }
    };

    // Fired immediately when speech begins
    recognition.onspeechstart = () => {
      if (!isMountedRef.current) return;
      // Ignore room acoustics and speaker output while assistant is speaking or thinking
      if (isSpeakingRef.current || isThinkingRef.current) {
        return;
      }
      setIsUserSpeaking(true);
      isUserSpeakingRef.current = true;
    };

    // Fired immediately when user finishes speaking
    recognition.onspeechend = () => {
      if (!isMountedRef.current) return;

      if (speechEndTimerRef.current) {
        clearTimeout(speechEndTimerRef.current);
      }
      speechEndTimerRef.current = setTimeout(() => {
        const pending = (
          accumulatedFinalTranscriptRef.current + " " + latestInterimTranscriptRef.current
        ).trim() || (isUserSpeakingRef.current ? inputValueRef.current.trim() : "");

        if (pending && !isSpeakingRef.current && !isThinkingRef.current) {
          commitUserSpeechRef.current();
        }
      }, 750);
    };

    // Fired when sound ends (backup for speech end)
    recognition.onsoundend = () => {
      if (!isMountedRef.current) return;
      if (isUserSpeakingRef.current) {
        if (speechEndTimerRef.current) {
          clearTimeout(speechEndTimerRef.current);
        }
        speechEndTimerRef.current = setTimeout(() => {
          const pending = (
            accumulatedFinalTranscriptRef.current + " " + latestInterimTranscriptRef.current
          ).trim() || (isUserSpeakingRef.current ? inputValueRef.current.trim() : "");

          if (pending && !isSpeakingRef.current && !isThinkingRef.current) {
            commitUserSpeechRef.current();
          }
        }, 850);
      }
    };

    recognition.onresult = (event: SpeechRecognitionEventItem) => {
      if (!isMountedRef.current || isThinkingRef.current || isSpeakingRef.current) {
        return;
      }
      consecutiveNetworkErrorsRef.current = 0;

      let currentInterim = "";
      let newlyFinalized = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const item = event.results[i];
        if (item && item[0]) {
          if (item.isFinal) {
            newlyFinalized += item[0].transcript + " ";
          } else {
            currentInterim += item[0].transcript;
          }
        }
      }

      if (newlyFinalized) {
        accumulatedFinalTranscriptRef.current += newlyFinalized;
      }
      latestInterimTranscriptRef.current = currentInterim;

      const fullTranscript = (
        accumulatedFinalTranscriptRef.current + " " + currentInterim
      ).trim();

      if (fullTranscript) {
        setIsUserSpeaking(true);
        isUserSpeakingRef.current = true;
        setLiveUserTranscript(fullTranscript);

        // Keep input ref and input field in sync with spoken voice
        inputValueRef.current = fullTranscript;
        setInputValue(fullTranscript);

        // Show live user speech in subtitles as they speak
        setDialogue((prev) => ({
          user: fullTranscript,
          agent: prev?.agent,
          provider: "MIC DIRECTIVE RECORDING...",
        }));

        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }

        // Voice activity silence window:
        // Natural conversational pause: 1100ms for finalized or 1500ms for interim
        const silenceDelayMs = newlyFinalized.length > 0 ? 1100 : 1500;
        silenceTimerRef.current = setTimeout(() => {
          commitUserSpeechRef.current();
        }, silenceDelayMs);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventItem) => {
      if (!isMountedRef.current) return;
      if (event.error === "no-speech" || event.error === "aborted") {
        return;
      }
      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed" ||
        event.error === "audio-capture"
      ) {
        setIsMicEnabled(false);
        isMicEnabledRef.current = false;
        updateStatus("idle");
        if (isVoiceReplyModeRef.current) {
          setDialogue((prev) => ({
            user: prev?.user,
            agent: prev?.agent || "Microphone input standby. Click Voice Input or type directives below.",
            provider: "READY",
          }));
        }
        return;
      }
      if (event.error === "network") {
        consecutiveNetworkErrorsRef.current += 1;
        if (consecutiveNetworkErrorsRef.current >= 2) {
          setIsMicEnabled(false);
          isMicEnabledRef.current = false;
          updateStatus("idle");
          setDialogue((prev) => ({
            user: prev?.user,
            agent: prev?.agent || "Voice interface synchronized. Speak into your microphone or type directives below.",
            provider: "READY",
          }));
        }
        return;
      }
    };

    recognition.onend = () => {
      isRecognitionActiveRef.current = false;
      if (!isMountedRef.current) return;

      // If user had spoken and recognizer ended, process speech immediately
      const pendingSpeech = (
        accumulatedFinalTranscriptRef.current + " " + latestInterimTranscriptRef.current
      ).trim() || (isUserSpeakingRef.current ? inputValueRef.current.trim() : "");

      if (pendingSpeech && !isSpeakingRef.current && !isThinkingRef.current) {
        commitUserSpeechRef.current();
        return;
      }

      // Stop restart loop if network errors occurred
      if (consecutiveNetworkErrorsRef.current >= 2) {
        return;
      }

      // Auto-restart listening if mic is enabled and not speaking/thinking
      if (
        isMicEnabledRef.current &&
        !isSpeakingRef.current &&
        !isThinkingRef.current
      ) {
        if (restartTimeoutRef.current) {
          clearTimeout(restartTimeoutRef.current);
        }
        restartTimeoutRef.current = setTimeout(() => {
          if (
            isMountedRef.current &&
            isMicEnabledRef.current &&
            !isSpeakingRef.current &&
            !isThinkingRef.current
          ) {
            startListeningRef.current();
          }
        }, 400);
      }
    };

    // Load available voices early
    if ("speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.getVoices();
    }

    return () => {
      isMountedRef.current = false;
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (speechEndTimerRef.current) {
        clearTimeout(speechEndTimerRef.current);
      }
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
      if (ttsSafetyTimeoutRef.current) {
        clearTimeout(ttsSafetyTimeoutRef.current);
      }
      if (dialogueTimerRef.current) {
        clearTimeout(dialogueTimerRef.current);
      }
      if (typewriterIntervalRef.current) {
        clearInterval(typewriterIntervalRef.current);
      }
      if (keepAliveOscRef.current) {
        try {
          keepAliveOscRef.current.stop();
          keepAliveOscRef.current.disconnect();
        } catch {}
        keepAliveOscRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
      stopAllPlayback();
    };
  }, [stopAllPlayback, updateStatus]);

  const activePersona = VOICE_PERSONAS[selectedVoice];

  return (
    <>
      {/* Top Right Status & Controls Bar */}
      <div
        className="hud"
        style={{
          top: "24px",
          right: "24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: "8px",
          zIndex: 25,
        }}
      >
        <div style={{ display: "flex", gap: "8px", alignItems: "center", position: "relative" }}>
            {/* Voice Persona Selector */}
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => {
                  void unlockAudioSystems();
                  setIsVoiceMenuOpen((v) => !v);
                }}
                className="hud-btn"
                title="Select Assistant Voice Persona"
                style={{
                  height: "36px",
                  padding: "0 10px",
                  fontSize: "11px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  color: "#ffcc66",
                  borderColor: isVoiceMenuOpen ? "#ffcc66" : "rgba(255, 170, 48, 0.5)",
                  background: isVoiceMenuOpen ? "rgba(70, 35, 0, 0.75)" : undefined,
                }}
              >
                <span>{activePersona.icon}</span>
                <span>VOICE: {activePersona.label}</span>
                <span style={{ fontSize: "9px", opacity: 0.7 }}>{isVoiceMenuOpen ? "▲" : "▼"}</span>
              </button>

              {/* Voice Selection Dropdown Menu */}
              {isVoiceMenuOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "42px",
                    right: 0,
                    width: "240px",
                    background: "rgba(16, 8, 2, 0.95)",
                    border: "1px solid rgba(255, 170, 48, 0.6)",
                    borderRadius: "6px",
                    backdropFilter: "blur(12px)",
                    boxShadow: "0 0 20px rgba(255, 140, 20, 0.3), 0 4px 16px rgba(0,0,0,0.8)",
                    padding: "6px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    zIndex: 35,
                  }}
                >
                  <div
                    style={{
                      padding: "6px 8px 4px 8px",
                      fontSize: "10px",
                      letterSpacing: "0.1em",
                      color: "rgba(255, 170, 48, 0.6)",
                      borderBottom: "1px solid rgba(255, 170, 48, 0.2)",
                      fontWeight: "bold",
                    }}
                  >
                    SELECT AGENT VOICE
                  </div>
                  {(Object.keys(VOICE_PERSONAS) as VoicePersona[]).map((vKey) => {
                    const p = VOICE_PERSONAS[vKey];
                    const isCurrent = vKey === selectedVoice;
                    return (
                      <button
                        key={vKey}
                        type="button"
                        onClick={() => handleSelectVoice(vKey)}
                        style={{
                          textAlign: "left",
                          padding: "8px 10px",
                          background: isCurrent ? "rgba(255, 170, 48, 0.2)" : "transparent",
                          border: isCurrent ? "1px solid rgba(255, 170, 48, 0.5)" : "1px solid transparent",
                          borderRadius: "4px",
                          color: isCurrent ? "#ffcc66" : "#ffaa30",
                          cursor: "pointer",
                          fontFamily: '"Courier New", monospace',
                          transition: "all 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(255, 170, 48, 0.15)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = isCurrent ? "rgba(255, 170, 48, 0.2)" : "transparent";
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", fontWeight: "bold" }}>
                          <span>{p.icon} {p.label}</span>
                          <span style={{ fontSize: "9px", opacity: 0.6, letterSpacing: "0.08em" }}>{p.badge}</span>
                        </div>
                        <div style={{ fontSize: "10px", opacity: 0.7, marginTop: "2px" }}>
                          {p.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Mic Toggle Button */}
            <button
              type="button"
              onClick={toggleMic}
              className="hud-btn"
              title={isMicEnabled ? "Mute Microphone" : "Unmute Microphone"}
              style={{
                height: "36px",
                padding: "0 10px",
                fontSize: "11px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                color: isMicEnabled ? "#ffaa30" : "rgba(255, 170, 48, 0.5)",
                borderColor: isMicEnabled ? "rgba(255, 170, 48, 0.6)" : "rgba(255, 170, 48, 0.2)",
              }}
            >
              <span>{isMicEnabled ? "🎙️ MIC ON" : "🎙️ MIC OFF"}</span>
            </button>

            {/* Voice Mute / Unmute Toggle */}
            <button
              type="button"
              onClick={toggleVoiceMute}
              className="hud-btn"
              title={isVoiceMuted ? "Unmute Voice Audio" : "Mute Voice Audio"}
              style={{
                height: "36px",
                padding: "0 10px",
                fontSize: "11px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                color: !isVoiceMuted ? "#ffaa30" : "rgba(255, 170, 48, 0.5)",
              }}
            >
              <span>{!isVoiceMuted ? "🔊 TTS ON" : "🔇 TTS MUTED"}</span>
            </button>

            {/* Test Voice Button */}
            <button
              type="button"
              onClick={handleTestVoice}
              className="hud-btn"
              title="Test Agent Voice Output"
              style={{
                height: "36px",
                padding: "0 10px",
                fontSize: "11px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                color: status === "speaking" ? "#ffcc66" : "#ffaa30",
                borderColor: status === "speaking" ? "#ffcc66" : "rgba(255, 170, 48, 0.45)",
              }}
            >
              <span>{status === "speaking" ? "⏹️ STOP" : "🔊 TEST VOICE"}</span>
            </button>

            {/* Conversation Log Toggle */}
            <button
              type="button"
              onClick={() => setIsHistoryOpen((v) => !v)}
              className="hud-btn"
              title="Toggle Conversation Log"
              style={{
                height: "36px",
                padding: "0 10px",
                fontSize: "11px",
              }}
            >
              LOG ({messages.length})
            </button>

            {/* Status Pill */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "0 14px",
                height: "36px",
                background: "rgba(20, 10, 0, 0.65)",
                border: "1px solid rgba(255, 170, 48, 0.45)",
                borderRadius: "4px",
                fontSize: "11px",
                fontWeight: "bold",
                letterSpacing: "0.1em",
                color: "#ffaa30",
                backdropFilter: "blur(2px)",
                textShadow: "0 0 6px rgba(255, 170, 48, 0.7)",
                boxShadow: "0 0 12px rgba(255, 140, 20, 0.12) inset",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor:
                    status === "speaking"
                      ? "#ffcc66"
                      : status === "thinking"
                      ? "#ff8800"
                      : isUserSpeaking
                      ? "#ffdd44"
                      : isMicEnabled
                      ? "#ffaa30"
                      : "#885500",
                  boxShadow:
                    status === "speaking"
                      ? "0 0 10px #ffcc66"
                      : status === "thinking"
                      ? "0 0 10px #ff8800"
                      : isUserSpeaking
                      ? "0 0 12px #ffdd44"
                      : isMicEnabled
                      ? "0 0 6px #ffaa30"
                      : "none",
                }}
              />
              <span>
                {status === "speaking" && "TRANSMITTING"}
                {status === "thinking" && "PROCESSING"}
                {status === "listening" && (isUserSpeaking ? "HEARING..." : (isMicEnabled ? "LISTENING" : "STANDBY"))}
                {status === "idle" && (!isMicEnabled ? "STANDBY" : "READY")}
                {status === "unsupported" && "TEXT ONLY"}
              </span>
            </div>
          </div>
        </div>

      {/* Sci-Fi HUD Introductory Activation Prompt (displayed if browser restricted autoplay until first interaction) */}
      {needsInteraction && !hasIntroPlayed && (
        <div
          className="hud"
          style={{
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 35,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "14px",
            textAlign: "center",
            pointerEvents: "auto",
          }}
        >
          <button
            type="button"
            onClick={async () => {
              await unlockAudioSystems();
              void playIntroductoryStatement(true);
            }}
            className="hud-btn voice-action-btn"
            style={{
              padding: "16px 32px",
              height: "auto",
              fontSize: "14px",
              letterSpacing: "0.2em",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              background: "rgba(25, 12, 0, 0.92)",
              border: "1px solid #ffaa30",
              color: "#ffdd66",
              boxShadow: "0 0 32px rgba(255, 170, 48, 0.45), inset 0 0 20px rgba(255, 140, 20, 0.25)",
              animation: "pulse 2s infinite ease-in-out",
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: "20px" }}>⚡</span>
            <span>INITIALIZE ULTRON</span>
          </button>
          <div
            style={{
              fontSize: "11px",
              letterSpacing: "0.15em",
              color: "rgba(255, 200, 100, 0.85)",
              textShadow: "0 0 8px rgba(255, 170, 48, 0.7)",
              background: "rgba(10, 5, 0, 0.8)",
              padding: "6px 16px",
              borderRadius: "4px",
              border: "1px solid rgba(255, 170, 48, 0.25)",
            }}
          >
            CLICK ANYWHERE TO ENGAGE NEURAL VOICE INTERFACE
          </div>
        </div>
      )}

      {/* Live Dialogue & Subtitles HUD Banner */}
      {dialogue && (
        <div
          className="hud"
          style={{
            top: "80px",
            left: "50%",
            transform: "translateX(-50%)",
            maxWidth: "680px",
            width: "calc(100vw - 48px)",
            pointerEvents: "auto",
            zIndex: 22,
          }}
        >
          <div
            style={{
              padding: "14px 18px",
              background: "rgba(15, 8, 2, 0.88)",
              border: "1px solid rgba(255, 170, 48, 0.55)",
              borderRadius: "6px",
              backdropFilter: "blur(8px)",
              boxShadow: "0 0 24px rgba(255, 140, 20, 0.22) inset, 0 4px 20px rgba(0,0,0,0.8)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {dialogue.user && (
              <div
                style={{
                  fontSize: "12px",
                  color: "rgba(255, 200, 100, 0.75)",
                  letterSpacing: "0.05em",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px", flex: 1 }}>
                  <span style={{ color: "#ff8800", fontWeight: "bold" }}>&gt; USER:</span>
                  <span>&ldquo;{dialogue.user}&rdquo;</span>
                  {(isUserSpeaking || isVoiceReplyMode) && (
                    <span
                      style={{
                        fontSize: "10px",
                        color: "#ffaa30",
                        opacity: 0.85,
                        fontStyle: "italic",
                        letterSpacing: "0.08em",
                        animation: "pulse 1s infinite ease-in-out",
                      }}
                    >
                      (speaking...)
                    </span>
                  )}
                </div>
                {(isUserSpeaking || isVoiceReplyMode) && (
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => void stopUserSpeakingAndReply()}
                      className="hud-btn voice-action-btn"
                      style={{
                        height: "28px",
                        padding: "0 10px",
                        fontSize: "10px",
                        letterSpacing: "0.08em",
                        borderRadius: "4px",
                        borderColor: "#ffcc66",
                        color: "#ffdd66",
                      }}
                      title="Stop speaking now and let Ultron reply using voice"
                    >
                      ⏹️ STOP SPEAKING &amp; REPLY
                    </button>
                    <button
                      type="button"
                      onClick={cancelUserSpeaking}
                      className="hud-btn"
                      style={{
                        height: "28px",
                        padding: "0 8px",
                        fontSize: "10px",
                        borderRadius: "4px",
                      }}
                      title="Cancel voice input"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            )}
            {dialogue.agent && (
              <div
                style={{
                  fontSize: "14px",
                  lineHeight: "1.45",
                  color: "#ffcc66",
                  fontWeight: "500",
                  letterSpacing: "0.04em",
                  textShadow: "0 0 8px rgba(255, 204, 102, 0.6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "6px", flex: 1 }}>
                  <span style={{ color: "#ffaa30", fontWeight: "bold" }}>[ULTRON]:</span>
                  <span>{dialogue.agent}</span>
                  {status === "speaking" && <span className="autotype-cursor" />}

                  {/* Animated Voice Equalizer when speaking */}
                  {status === "speaking" && (
                    <span className="voice-equalizer" title="Transmitting Voice">
                      <span className="voice-eq-bar" />
                      <span className="voice-eq-bar" />
                      <span className="voice-eq-bar" />
                      <span className="voice-eq-bar" />
                      <span className="voice-eq-bar" />
                    </span>
                  )}
                </div>

                {status === "speaking" && (
                  <button
                    type="button"
                    onClick={() => void stopAssistantAndReplyVoice()}
                    className="hud-btn voice-action-btn"
                    style={{
                      height: "28px",
                      padding: "0 10px",
                      fontSize: "10px",
                      letterSpacing: "0.08em",
                      borderRadius: "4px",
                      borderColor: "#ffcc66",
                      color: "#ffdd66",
                      animation: "pulse 1.5s infinite ease-in-out",
                    }}
                    title="Stop Ultron speaking and reply with your voice"
                  >
                    ⏹️ STOP &amp; REPLY BY VOICE
                  </button>
                )}
              </div>
            )}
            {dialogue.provider && (
              <div
                style={{
                  fontSize: "9px",
                  letterSpacing: "0.15em",
                  color: "rgba(255, 170, 48, 0.45)",
                  alignSelf: "flex-end",
                  marginTop: "2px",
                }}
              >
                ENGINE: {dialogue.provider}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Conversation Log Modal / Drawer */}
      {isHistoryOpen && (
        <div
          className="hud"
          style={{
            top: "80px",
            right: "24px",
            width: "360px",
            maxHeight: "calc(100vh - 180px)",
            background: "rgba(12, 6, 0, 0.94)",
            border: "1px solid rgba(255, 170, 48, 0.5)",
            borderRadius: "6px",
            backdropFilter: "blur(10px)",
            boxShadow: "0 0 20px rgba(255, 140, 20, 0.2)",
            display: "flex",
            flexDirection: "column",
            zIndex: 26,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid rgba(255, 170, 48, 0.3)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "12px",
              fontWeight: "bold",
              letterSpacing: "0.1em",
            }}
          >
            <span>TELEMETRY LOG</span>
            <button
              type="button"
              onClick={() => setIsHistoryOpen(false)}
              className="hud-btn"
              style={{ height: "24px", minWidth: "24px", padding: "0 6px", fontSize: "11px" }}
            >
              ✕
            </button>
          </div>
          <div
            style={{
              padding: "12px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              fontSize: "11px",
              lineHeight: "1.4",
            }}
          >
            {messages.length === 0 ? (
              <div style={{ opacity: 0.5, textAlign: "center", padding: "20px 0" }}>No exchanges logged yet.</div>
            ) : (
              messages.map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "4px",
                    background:
                      m.role === "user" ? "rgba(255, 140, 0, 0.1)" : "rgba(255, 200, 50, 0.08)",
                    borderLeft: `2px solid ${m.role === "user" ? "#ff8800" : "#ffcc66"}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: "9px",
                      fontWeight: "bold",
                      color: m.role === "user" ? "#ffaa30" : "#ffcc66",
                      marginBottom: "2px",
                    }}
                  >
                    {m.role === "user" ? "USER" : "ULTRON"}
                  </div>
                  <div style={{ color: "#fff", opacity: 0.9 }}>{m.content}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Bottom Center Sci-Fi Interactive Chat HUD Input */}
      <div
        className="hud"
        style={{
          bottom: "24px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(620px, calc(100vw - 48px))",
          zIndex: 25,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {/* If Assistant is speaking: prominent Stop & Reply by Voice banner */}
        {status === "speaking" && (
          <button
            type="button"
            onClick={() => void stopAssistantAndReplyVoice()}
            className="hud-btn voice-action-btn"
            style={{
              height: "40px",
              padding: "0 16px",
              fontSize: "12px",
              letterSpacing: "0.1em",
              borderRadius: "6px",
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              animation: "pulse 1.5s infinite ease-in-out",
            }}
            title="Stop assistant speech and speak your reply"
          >
            <span>⏹️ STOP ULTRON &amp; REPLY BY VOICE</span>
            <span style={{ fontSize: "10px", opacity: 0.75 }}>(ESC / Space)</span>
          </button>
        )}

        {/* Fallback button if browser autoplay blocked voice audio */}
        {pendingVoiceAudio && (
          <button
            type="button"
            onClick={async () => {
              await unlockAudioSystems();
              pendingVoiceAudio.play();
              setPendingVoiceAudio(null);
            }}
            className="hud-btn voice-action-btn"
            style={{
              height: "38px",
              padding: "0 16px",
              fontSize: "12px",
              letterSpacing: "0.1em",
              borderRadius: "6px",
              borderColor: "#ffaa30",
              color: "#ffdd66",
              background: "rgba(35, 15, 0, 0.95)",
              boxShadow: "0 0 16px rgba(255, 170, 48, 0.5)",
              animation: "pulse 1.5s infinite ease-in-out",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              width: "100%",
            }}
          >
            <span>🔊 CLICK TO HEAR AGENT VOICE</span>
          </button>
        )}

        {/* Interactive Chat Form with Live Speech Autotyping */}
        <form
          onSubmit={handleInputSubmit}
          className={isUserSpeaking ? "speech-active-container" : ""}
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "center",
            background: isUserSpeaking ? "rgba(28, 14, 0, 0.94)" : "rgba(18, 9, 0, 0.8)",
            border: isUserSpeaking ? "1px solid #ffaa30" : "1px solid rgba(255, 170, 48, 0.5)",
            borderRadius: "6px",
            padding: "5px 8px 5px 12px",
            backdropFilter: "blur(6px)",
            boxShadow: isUserSpeaking
              ? "0 0 20px rgba(255, 140, 20, 0.3) inset, 0 0 14px rgba(255, 170, 48, 0.4)"
              : "0 0 16px rgba(255, 140, 20, 0.18) inset, 0 4px 12px rgba(0,0,0,0.6)",
            transition: "all 0.2s ease",
          }}
        >
          {/* Prefix indicator: Equalizer when speaking, prompt chevron otherwise */}
          {isUserSpeaking ? (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span className="voice-equalizer" title="Listening to speech">
                <span className="voice-eq-bar" />
                <span className="voice-eq-bar" />
                <span className="voice-eq-bar" />
                <span className="voice-eq-bar" />
                <span className="voice-eq-bar" />
              </span>
              <span className="autotype-badge">
                AUTOTYPING
              </span>
            </div>
          ) : (
            <span style={{ color: "#ffaa30", fontWeight: "bold", fontSize: "14px", opacity: 0.8 }}>&gt;</span>
          )}

          {/* Autotyping Input Field */}
          <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center" }}>
            <input
              type="text"
              value={inputValue}
              onFocus={() => {
                void unlockAudioSystems();
              }}
              onChange={(e) => {
                setInputValue(e.target.value);
                inputValueRef.current = e.target.value;
              }}
              onKeyDown={async (e) => {
                await unlockAudioSystems();
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleInputSubmit(e);
                }
              }}
              placeholder={
                status === "thinking"
                  ? "Ultron is processing your voice directive..."
                  : isUserSpeaking
                  ? "Transcribing your speech in real time..."
                  : isMicEnabled
                  ? "Speak into mic to autotype directive, or type here…"
                  : "Type a directive or click Voice Input…"
              }
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                outline: "none",
                color: isUserSpeaking ? "#ffdd66" : "#ffcc66",
                fontFamily: '"Courier New", monospace',
                fontSize: "13px",
                letterSpacing: "0.05em",
                textShadow: isUserSpeaking ? "0 0 8px rgba(255, 204, 102, 0.8)" : "none",
              }}
            />
            {isUserSpeaking && <span className="autotype-cursor" />}
          </div>

          {/* Actions: Send Now & Cancel if speaking; Voice Input & Transmit otherwise */}
          {isUserSpeaking ? (
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => void stopUserSpeakingAndReply()}
                className="hud-btn voice-action-btn"
                style={{
                  height: "34px",
                  padding: "0 12px",
                  fontSize: "11px",
                  borderRadius: "4px",
                  borderColor: "#ffcc66",
                  color: "#ffdd66",
                  whiteSpace: "nowrap",
                }}
                title="Transmit speech directive immediately for voice response"
              >
                ⏹️ SEND NOW
              </button>
              <button
                type="button"
                onClick={cancelUserSpeaking}
                className="hud-btn"
                style={{
                  height: "34px",
                  padding: "0 9px",
                  fontSize: "12px",
                  borderRadius: "4px",
                }}
                title="Cancel voice input"
              >
                ✕
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => void startVoiceReply()}
                className="hud-btn"
                title="Speak through microphone to autotype directive"
                style={{
                  height: "34px",
                  padding: "0 12px",
                  fontSize: "11px",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  color: isVoiceReplyMode ? "#ffdd66" : "#ffcc66",
                  borderColor: isVoiceReplyMode ? "#ffcc66" : "rgba(255, 170, 48, 0.6)",
                  background: isVoiceReplyMode ? "rgba(80, 40, 0, 0.7)" : undefined,
                  whiteSpace: "nowrap",
                }}
              >
                <span>🎙️ VOICE INPUT</span>
              </button>

              <button
                type="submit"
                disabled={!inputValue.trim() || status === "thinking"}
                className="hud-btn"
                style={{
                  height: "34px",
                  padding: "0 14px",
                  fontSize: "12px",
                  opacity: inputValue.trim() && status !== "thinking" ? 1 : 0.45,
                }}
              >
                TRANSMIT
              </button>
            </div>
          )}
        </form>

        {/* Real-time autotype guidance */}
        {isUserSpeaking && (
          <div
            style={{
              fontSize: "10px",
              color: "rgba(255, 200, 100, 0.75)",
              textAlign: "center",
              letterSpacing: "0.08em",
            }}
          >
            PAUSE SPEAKING TO AUTO-TRANSMIT &amp; HEAR VOICE RESPONSE
          </div>
        )}
      </div>

      {/* Hidden primed audio element for seamless cross-browser speech playback */}
      <audio ref={persistentAudioRef} preload="auto" playsInline style={{ display: "none" }} />
    </>
  );
}

