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
  onresult: ((event: SpeechRecognitionEventItem) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventItem) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface VoiceBotProps {
  onAgentStateChange?: (state: AgentState) => void;
}

export default function VoiceBot({ onAgentStateChange }: VoiceBotProps) {
  const [status, setStatus] = useState<AgentState>("listening");
  const [needsGesture, setNeedsGesture] = useState<boolean>(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState<string>("");
  const [isMicEnabled, setIsMicEnabled] = useState<boolean>(true);
  const [isVoiceMuted, setIsVoiceMuted] = useState<boolean>(false);
  const [selectedVoice, setSelectedVoice] = useState<VoicePersona>("jarvis");
  const [isVoiceMenuOpen, setIsVoiceMenuOpen] = useState<boolean>(false);
  const [dialogue, setDialogue] = useState<{ user?: string; agent?: string; provider?: string } | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [audioBlockedNotice, setAudioBlockedNotice] = useState<boolean>(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const isSpeakingRef = useRef<boolean>(false);
  const isThinkingRef = useRef<boolean>(false);
  const isUserSpeakingRef = useRef<boolean>(false);
  const isMicEnabledRef = useRef<boolean>(true);
  const isVoiceMutedRef = useRef<boolean>(false);
  const selectedVoiceRef = useRef<VoicePersona>("jarvis");
  const needsGestureRef = useRef<boolean>(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const accumulatedFinalTranscriptRef = useRef<string>("");
  const latestInterimTranscriptRef = useRef<string>("");
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const ttsSafetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dialogueTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingAudioRef = useRef<{ text: string; persona: VoicePersona } | null>(null);

  messagesRef.current = messages;
  isMicEnabledRef.current = isMicEnabled;
  isVoiceMutedRef.current = isVoiceMuted;
  selectedVoiceRef.current = selectedVoice;

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
  }, []);

  /**
   * Unlock Web Audio & browser audio elements on user interaction.
   * A running AudioContext permanently bypasses async autoplay restrictions.
   */
  const unlockAudioSystems = useCallback(async (): Promise<AudioContext | null> => {
    if (typeof window === "undefined") return null;

    let ctx = audioContextRef.current;
    if (!ctx) {
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

    // Play a microscopic silent buffer to guarantee the context is marked as user-unlocked
    if (ctx && ctx.state === "running") {
      try {
        const silentBuf = ctx.createBuffer(1, 1, 22050);
        const silentSrc = ctx.createBufferSource();
        silentSrc.buffer = silentBuf;
        silentSrc.connect(ctx.destination);
        silentSrc.start(0);
      } catch {}
    }

    // Prepare and unlock HTML5 Audio element
    try {
      if (!audioElementRef.current) {
        audioElementRef.current = new Audio();
      }
      const silentAudio = audioElementRef.current;
      silentAudio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
      void silentAudio.play().catch(() => {});
    } catch {}

    // Prepare SpeechSynthesis
    if ("speechSynthesis" in window) {
      try {
        window.speechSynthesis.resume();
      } catch {}
    }

    setNeedsGesture(false);
    needsGestureRef.current = false;
    setAudioBlockedNotice(false);
    return ctx;
  }, []);

  const startListening = useCallback(() => {
    if (
      !isMountedRef.current ||
      isSpeakingRef.current ||
      isThinkingRef.current ||
      !isMicEnabledRef.current
    ) {
      return;
    }
    const recognition = recognitionRef.current;
    if (!recognition) return;

    try {
      recognition.start();
      setNeedsGesture(false);
      needsGestureRef.current = false;
      updateStatus("listening");
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "InvalidStateError") {
        return;
      }
      console.warn("Speech recognition start requires user gesture:", err);
      setNeedsGesture(true);
      needsGestureRef.current = true;
    }
  }, [updateStatus]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
  }, []);

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
   * Client-side Web Speech API fallback with persona-tailored voice selection
   */
  const fallbackSpeechSynthesis = useCallback(
    (text: string, persona: VoicePersona, onFinish: () => void) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        onFinish();
        return;
      }

      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();
      } catch {}

      // Short delay to avoid Chrome asynchronous cancel dropping the new utterance
      setTimeout(() => {
        if (!isMountedRef.current || !isSpeakingRef.current) {
          onFinish();
          return;
        }

        try {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.volume = 1.0;

          const voices = window.speechSynthesis.getVoices();
          if (voices.length > 0) {
            let preferredVoice: SpeechSynthesisVoice | undefined;

            if (persona === "jarvis") {
              // British articulate AI
              preferredVoice =
                voices.find(
                  (v) =>
                    (v.lang.startsWith("en-GB") || v.lang.startsWith("en_GB")) &&
                    /Google|Daniel|Arthur|Oliver|George|Natural|British/i.test(v.name)
                ) ||
                voices.find((v) => v.lang.startsWith("en-GB") || v.lang.startsWith("en_GB"));
              utterance.rate = 1.0;
              utterance.pitch = 0.98;
            } else if (persona === "ultron") {
              // Deep cyborg
              preferredVoice =
                voices.find(
                  (v) =>
                    v.lang.startsWith("en") &&
                    /David|Guy|Mark|Google UK English Male|Google US English/i.test(v.name)
                ) || voices.find((v) => v.lang.startsWith("en"));
              utterance.rate = 0.93;
              utterance.pitch = 0.82;
            } else if (persona === "friday") {
              // Natural female AI
              preferredVoice =
                voices.find(
                  (v) =>
                    v.lang.startsWith("en") &&
                    /Samantha|Victoria|Zira|Jenny|Google US English|Natural/i.test(v.name)
                ) || voices.find((v) => v.lang.startsWith("en"));
              utterance.rate = 1.03;
              utterance.pitch = 1.06;
            } else {
              preferredVoice = voices.find((v) => v.lang.startsWith("en")) || voices[0];
              utterance.rate = 1.0;
              utterance.pitch = 1.0;
            }

            if (preferredVoice) {
              utterance.voice = preferredVoice;
            }
          }

          utterance.onend = () => {
            onFinish();
          };

          utterance.onerror = (e) => {
            console.warn("Browser speech synthesis error:", e);
            onFinish();
          };

          activeUtteranceRef.current = utterance;
          window.speechSynthesis.speak(utterance);

          // Workaround for Chrome speech synthesis pausing on longer utterances
          const resumeInterval = setInterval(() => {
            if (typeof window !== "undefined" && "speechSynthesis" in window) {
              if (window.speechSynthesis.speaking) {
                window.speechSynthesis.resume();
              } else {
                clearInterval(resumeInterval);
              }
            } else {
              clearInterval(resumeInterval);
            }
          }, 2500);
        } catch (e) {
          console.warn("Speech synthesis invocation failed:", e);
          onFinish();
        }
      }, 50);
    },
    []
  );

  /**
   * Main speech playback engine:
   * Multi-stage resilient pipeline with Web Audio API, HTML5 Audio, and SpeechSynthesis fallback.
   */
  const speakReply = useCallback(
    async (text: string, voicePersonaOverride?: VoicePersona) => {
      const currentPersona = voicePersonaOverride || selectedVoiceRef.current;
      const cleanText = text
        .replace(/https?:\/\/\S+/gi, "")
        .replace(/[*_~`#\[\]\(\)\{\}\>\<\+\=\|\\]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (!cleanText) {
        isSpeakingRef.current = false;
        updateStatus(isMicEnabledRef.current ? "listening" : "idle");
        if (isMicEnabledRef.current) startListening();
        return;
      }

      if (isVoiceMutedRef.current) {
        isSpeakingRef.current = false;
        updateStatus(isMicEnabledRef.current ? "listening" : "idle");
        if (isMicEnabledRef.current) startListening();
        return;
      }

      // Stop any existing speech / audio playback
      stopAllPlayback();

      // Pause microphone listening so Ultron doesn't listen to his own speech
      stopListening();

      isSpeakingRef.current = true;
      updateStatus("speaking");

      // Pre-unlock AudioContext if needed
      const ctx = await unlockAudioSystems();
      playJarvisChirp();

      const handleFinished = () => {
        if (ttsSafetyTimeoutRef.current) {
          clearTimeout(ttsSafetyTimeoutRef.current);
          ttsSafetyTimeoutRef.current = null;
        }
        currentSourceNodeRef.current = null;
        activeUtteranceRef.current = null;
        setAudioBlockedNotice(false);

        if (!isMountedRef.current) return;
        isSpeakingRef.current = false;
        updateStatus(isMicEnabledRef.current ? "listening" : "idle");

        // Delay resuming listening by 350ms to avoid audio reverb picking up
        if (isMicEnabledRef.current) {
          setTimeout(() => {
            if (isMountedRef.current && !isSpeakingRef.current && isMicEnabledRef.current) {
              startListening();
            }
          }, 350);
        }
      };

      // Safety timer in case playback events are dropped
      const estimatedDurationMs = Math.max(6000, (cleanText.length / 9) * 1000 + 4500);
      ttsSafetyTimeoutRef.current = setTimeout(() => {
        if (isSpeakingRef.current) {
          console.warn("Voice playback safety timeout reached, restoring state");
          handleFinished();
        }
      }, estimatedDurationMs);

      // If user selected native browser engine directly
      if (currentPersona === "system") {
        fallbackSpeechSynthesis(cleanText, "system", handleFinished);
        return;
      }

      // 1. Primary: Server-Side TTS with Web Audio decoding (unrestricted autoplay once running)
      try {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: cleanText,
            voice: VOICE_PERSONAS[currentPersona].serverVoice,
          }),
        });

        if (!response.ok) {
          throw new Error(`TTS server responded with ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        if (!isMountedRef.current || !isSpeakingRef.current) return;

        // Try playing via Web Audio API ONLY IF the context is actively running
        if (ctx && ctx.state === "running") {
          try {
            // Clone arrayBuffer before decodeAudioData so original buffer is not neutered if fallback is needed
            const bufferCopy = arrayBuffer.slice(0);
            const audioBuffer = await ctx.decodeAudioData(bufferCopy);
            if (!isMountedRef.current || !isSpeakingRef.current) return;

            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;

            // Apply acoustic filter tailored to voice persona
            if (currentPersona === "ultron") {
              // Deep cyborg bass resonance + subtle pitch shift
              const bassBoost = ctx.createBiquadFilter();
              bassBoost.type = "lowshelf";
              bassBoost.frequency.setValueAtTime(320, ctx.currentTime);
              bassBoost.gain.setValueAtTime(5.5, ctx.currentTime);

              source.playbackRate.setValueAtTime(0.93, ctx.currentTime);
              source.connect(bassBoost);
              bassBoost.connect(ctx.destination);
            } else if (currentPersona === "jarvis") {
              // High-clarity articulate presence
              const presence = ctx.createBiquadFilter();
              presence.type = "peaking";
              presence.frequency.setValueAtTime(2900, ctx.currentTime);
              presence.gain.setValueAtTime(2.8, ctx.currentTime);

              source.playbackRate.setValueAtTime(1.0, ctx.currentTime);
              source.connect(presence);
              presence.connect(ctx.destination);
            } else {
              source.connect(ctx.destination);
            }

            currentSourceNodeRef.current = source;
            source.onended = () => {
              handleFinished();
            };

            source.start(0);
            setAudioBlockedNotice(false);
            return;
          } catch (webAudioErr) {
            console.warn("Web Audio buffer decoding failed, trying HTML5 Audio:", webAudioErr);
          }
        }

        // 2. Secondary: HTML5 Audio Element playback
        try {
          const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
          const audioUrl = URL.createObjectURL(blob);
          const audio = audioElementRef.current || new Audio();
          audioElementRef.current = audio;
          audio.src = audioUrl;
          audio.volume = 1.0;

          audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            handleFinished();
          };

          audio.onerror = () => {
            URL.revokeObjectURL(audioUrl);
            fallbackSpeechSynthesis(cleanText, currentPersona, handleFinished);
          };

          await audio.play();
          setAudioBlockedNotice(false);
          return;
        } catch (playErr) {
          console.warn("HTML5 audio element playback restricted by browser policy:", playErr);
          pendingAudioRef.current = { text: cleanText, persona: currentPersona };
          setAudioBlockedNotice(true);
          fallbackSpeechSynthesis(cleanText, currentPersona, handleFinished);
          return;
        }
      } catch (err) {
        console.warn("Network TTS failed, falling back to Web Speech Synthesis:", err);
        fallbackSpeechSynthesis(cleanText, currentPersona, handleFinished);
      }
    },
    [fallbackSpeechSynthesis, playJarvisChirp, startListening, stopAllPlayback, stopListening, unlockAudioSystems, updateStatus]
  );

  const processUtterance = useCallback(
    async (userInput: string) => {
      if (!isMountedRef.current || !userInput.trim()) return;

      const trimmed = userInput.trim();
      isThinkingRef.current = true;
      updateStatus("thinking");

      // Pause speech recognition while processing
      stopListening();

      // Show user query in dialogue immediately
      setDialogue((prev) => ({
        user: trimmed,
        agent: prev?.agent,
        provider: prev?.provider,
      }));

      // Reset dialogue dismiss timer
      if (dialogueTimerRef.current) {
        clearTimeout(dialogueTimerRef.current);
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

        setDialogue({
          user: trimmed,
          agent: reply,
          provider: `${provider.toUpperCase()} · ${VOICE_PERSONAS[selectedVoiceRef.current].label}`,
        });

        isThinkingRef.current = false;
        void speakReply(reply);

        // Auto-fade dialogue after 20 seconds of inactivity
        dialogueTimerRef.current = setTimeout(() => {
          if (isMountedRef.current && !isSpeakingRef.current && !isThinkingRef.current) {
            setDialogue(null);
          }
        }, 20000);
      } catch (error) {
        console.error("Error communicating with /api/chat:", error);
        if (!isMountedRef.current) return;

        const fallbackReply = "All systems operational. Telemetry indicates ready status.";
        setDialogue({
          user: trimmed,
          agent: fallbackReply,
          provider: "OFFLINE",
        });

        isThinkingRef.current = false;
        void speakReply(fallbackReply);
      }
    },
    [speakReply, stopListening, updateStatus]
  );

  /**
   * Called once the user has finished talking (silence detected or speech finalized).
   * Commits the accumulated user transcript and triggers agent thinking and voice response.
   */
  const commitUserSpeech = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    const speech = (
      accumulatedFinalTranscriptRef.current + " " + latestInterimTranscriptRef.current
    ).trim();

    accumulatedFinalTranscriptRef.current = "";
    latestInterimTranscriptRef.current = "";
    setIsUserSpeaking(false);
    isUserSpeakingRef.current = false;

    if (!speech || isSpeakingRef.current || isThinkingRef.current) {
      return;
    }

    // Stop listening while thinking and speaking so Ultron doesn't listen to his own speech
    stopListening();
    void processUtterance(speech);
  }, [processUtterance, stopListening]);

  /**
   * Activated when user clicks the "ACTIVATE VOICE INTERFACE" button
   */
  const handleActivateVoice = useCallback(async () => {
    setNeedsGesture(false);
    needsGestureRef.current = false;
    setAudioBlockedNotice(false);

    // Unlock Web Audio & persistent audio
    await unlockAudioSystems();

    // Request microphone permission on user click
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch (err) {
        console.warn("Microphone access request:", err);
      }
    }

    setIsMicEnabled(true);
    isMicEnabledRef.current = true;

    // Speak immediate welcoming vocal confirmation
    const welcomeText = "ULTRON voice interface online. Systems synchronized and standing by.";
    setDialogue({
      agent: welcomeText,
      provider: "VOICE ONLINE",
    });
    void speakReply(welcomeText);
  }, [speakReply, unlockAudioSystems]);

  const toggleMic = useCallback(() => {
    void unlockAudioSystems();
    setIsMicEnabled((prev) => {
      const next = !prev;
      isMicEnabledRef.current = next;
      if (next) {
        startListening();
      } else {
        stopListening();
        updateStatus("idle");
      }
      return next;
    });
  }, [startListening, stopListening, unlockAudioSystems, updateStatus]);

  const toggleVoiceMute = useCallback(() => {
    void unlockAudioSystems();
    setIsVoiceMuted((prev) => {
      const next = !prev;
      isVoiceMutedRef.current = next;
      if (next) {
        if (currentSourceNodeRef.current) {
          try {
            currentSourceNodeRef.current.stop();
          } catch {}
          currentSourceNodeRef.current = null;
        }
        if (audioElementRef.current) {
          audioElementRef.current.pause();
        }
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          try {
            window.speechSynthesis.cancel();
          } catch {}
        }
      }
      return next;
    });
  }, [unlockAudioSystems]);

  const handleTestVoice = useCallback(() => {
    void unlockAudioSystems();

    if (isSpeakingRef.current) {
      if (currentSourceNodeRef.current) {
        try {
          currentSourceNodeRef.current.stop();
        } catch {}
        currentSourceNodeRef.current = null;
      }
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {}
      }
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
    void speakReply(testPhrase);
  }, [selectedVoice, speakReply, unlockAudioSystems, updateStatus]);

  /**
   * Play any pending agent speech response that was blocked by browser autoplay policy
   */
  const handlePlayPendingAudio = useCallback(async () => {
    await unlockAudioSystems();
    setAudioBlockedNotice(false);

    if (pendingAudioRef.current?.text) {
      const { text, persona } = pendingAudioRef.current;
      pendingAudioRef.current = null;
      void speakReply(text, persona);
    } else {
      void handleTestVoice();
    }
  }, [handleTestVoice, speakReply, unlockAudioSystems]);

  const handleSelectVoice = useCallback((personaId: VoicePersona) => {
    setSelectedVoice(personaId);
    selectedVoiceRef.current = personaId;
    setIsVoiceMenuOpen(false);
    void unlockAudioSystems();

    const persona = VOICE_PERSONAS[personaId];
    const notifyPhrase = `Voice persona updated to ${persona.label}.`;
    setDialogue({
      agent: notifyPhrase,
      provider: persona.badge,
    });
    void speakReply(notifyPhrase, personaId);
  }, [speakReply, unlockAudioSystems]);

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text) return;
    setInputValue("");

    // Unlock audio context synchronously during form submission gesture
    void unlockAudioSystems();
    void processUtterance(text);
  };

  // Listen for user gestures anywhere on document to ensure audio context is active
  useEffect(() => {
    const handleGesture = () => {
      void unlockAudioSystems();
    };

    window.addEventListener("pointerdown", handleGesture, { passive: true });
    window.addEventListener("keydown", handleGesture, { passive: true });
    window.addEventListener("touchstart", handleGesture, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", handleGesture);
      window.removeEventListener("keydown", handleGesture);
      window.removeEventListener("touchstart", handleGesture);
    };
  }, [unlockAudioSystems]);


  useEffect(() => {
    isMountedRef.current = true;

    if (typeof window === "undefined") return;

    // Detect if browser requires user gesture for audio context
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      try {
        const probeCtx = new AudioCtx();
        if (probeCtx.state === "suspended") {
          setNeedsGesture(true);
          needsGestureRef.current = true;
        }
        void probeCtx.close().catch(() => {});
      } catch {}
    }

    const SpeechRecConstructor =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;

    if (!SpeechRecConstructor) {
      updateStatus("unsupported");
      return;
    }

    const recognition = new SpeechRecConstructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      if (!isSpeakingRef.current && !isThinkingRef.current && isMountedRef.current) {
        updateStatus("listening");
      }
    };

    recognition.onresult = (event: SpeechRecognitionEventItem) => {
      if (!isMountedRef.current || isSpeakingRef.current || isThinkingRef.current) {
        return;
      }

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

        // Show live user speech in subtitles as they speak
        setDialogue((prev) => ({
          user: fullTranscript,
          agent: prev?.agent,
          provider: prev?.provider,
        }));

        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }

        // Voice activity silence window:
        // Once user pauses after talking (800ms for finalized or 1200ms for interim),
        // trigger agent response!
        const silenceDelayMs = newlyFinalized.length > 0 ? 800 : 1200;
        silenceTimerRef.current = setTimeout(() => {
          commitUserSpeech();
        }, silenceDelayMs);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventItem) => {
      if (!isMountedRef.current) return;
      if (event.error === "no-speech") {
        return;
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setNeedsGesture(true);
        needsGestureRef.current = true;
      }
    };

    recognition.onend = () => {
      if (!isMountedRef.current) return;

      // If user had spoken and recognizer ended, process speech immediately
      const pendingSpeech = (
        accumulatedFinalTranscriptRef.current + " " + latestInterimTranscriptRef.current
      ).trim();

      if (pendingSpeech && !isSpeakingRef.current && !isThinkingRef.current) {
        commitUserSpeech();
        return;
      }

      // Auto-restart listening if mic is enabled and not speaking/thinking
      if (
        isMicEnabledRef.current &&
        !isSpeakingRef.current &&
        !isThinkingRef.current &&
        !needsGestureRef.current
      ) {
        if (restartTimeoutRef.current) {
          clearTimeout(restartTimeoutRef.current);
        }
        restartTimeoutRef.current = setTimeout(() => {
          if (
            isMountedRef.current &&
            isMicEnabledRef.current &&
            !isSpeakingRef.current &&
            !isThinkingRef.current &&
            !needsGestureRef.current
          ) {
            startListening();
          }
        }, 250);
      }
    };

    // Load available voices early
    if ("speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.getVoices();
    }

    // Attempt auto-start on mount
    startListening();

    return () => {
      isMountedRef.current = false;
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
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
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
      stopAllPlayback();
    };
  }, [commitUserSpeech, startListening, stopAllPlayback, updateStatus]);

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
        {/* Browser Audio Unlock Alert Button if Autoplay was flagged */}
        {audioBlockedNotice && (
          <button
            type="button"
            onClick={() => {
              void handlePlayPendingAudio();
            }}
            className="hud-btn"
            style={{
              height: "auto",
              padding: "8px 16px",
              fontSize: "11px",
              letterSpacing: "0.1em",
              color: "#ffdd66",
              borderColor: "#ffaa30",
              animation: "pulse 1.5s infinite ease-in-out",
              boxShadow: "0 0 14px rgba(255, 170, 48, 0.4)",
            }}
          >
            🔊 UNMUTE AGENT VOICE OUTPUT
          </button>
        )}

        {/* Activation Prompt if Gesture Required */}
        {needsGesture ? (
          <button
            type="button"
            onClick={handleActivateVoice}
            className="hud-btn"
            style={{
              height: "auto",
              padding: "9px 18px",
              fontSize: "12px",
              letterSpacing: "0.12em",
              animation: "pulse 2s infinite ease-in-out",
              color: "#ffcc66",
              borderColor: "#ffaa30",
              boxShadow: "0 0 16px rgba(255, 170, 48, 0.5)",
            }}
          >
            🎙️ ACTIVATE VOICE INTERFACE
          </button>
        ) : (
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
        )}
      </div>

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
                  flexWrap: "wrap",
                  gap: "6px",
                }}
              >
                <span style={{ color: "#ff8800", fontWeight: "bold" }}>&gt; USER:</span>
                <span>&ldquo;{dialogue.user}&rdquo;</span>
                {isUserSpeaking && (
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
                  alignItems: "baseline",
                  flexWrap: "wrap",
                  gap: "6px",
                }}
              >
                <span style={{ color: "#ffaa30", fontWeight: "bold" }}>[ULTRON]:</span>
                <span>{dialogue.agent}</span>

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
            )}
            {audioBlockedNotice && (
              <button
                type="button"
                onClick={() => {
                  void handlePlayPendingAudio();
                }}
                className="hud-btn"
                style={{
                  alignSelf: "flex-start",
                  padding: "6px 14px",
                  fontSize: "11px",
                  color: "#ffdd66",
                  borderColor: "#ffaa30",
                  animation: "pulse 1.5s infinite ease-in-out",
                  boxShadow: "0 0 12px rgba(255, 170, 48, 0.4)",
                  marginTop: "4px",
                }}
              >
                🔊 CLICK TO PLAY AGENT VOICE
              </button>
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
          width: "min(560px, calc(100vw - 48px))",
          zIndex: 25,
        }}
      >
        <form
          onSubmit={handleInputSubmit}
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "center",
            background: "rgba(18, 9, 0, 0.8)",
            border: "1px solid rgba(255, 170, 48, 0.5)",
            borderRadius: "6px",
            padding: "4px 6px 4px 12px",
            backdropFilter: "blur(6px)",
            boxShadow: "0 0 16px rgba(255, 140, 20, 0.18) inset, 0 4px 12px rgba(0,0,0,0.6)",
          }}
        >
          <span style={{ color: "#ffaa30", fontWeight: "bold", fontSize: "14px", opacity: 0.8 }}>&gt;</span>
          <input
            type="text"
            value={inputValue}
            onFocus={() => {
              void unlockAudioSystems();
            }}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              void unlockAudioSystems();
              // Prevent propagation so global hotkeys (G, R, etc.) are not triggered while typing
              e.stopPropagation();
            }}
            placeholder="Type a directive to ULTRON or speak aloud…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#ffcc66",
              fontFamily: '"Courier New", monospace',
              fontSize: "13px",
              letterSpacing: "0.05em",
            }}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || status === "thinking"}
            className="hud-btn"
            style={{
              height: "34px",
              padding: "0 14px",
              fontSize: "12px",
              opacity: inputValue.trim() ? 1 : 0.45,
            }}
          >
            TRANSMIT
          </button>
        </form>
      </div>
    </>
  );
}

