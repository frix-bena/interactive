"use client";

import { useEffect, useRef, useState, useCallback, useTransition } from "react";
import type { AgentState } from "@/lib/orbScene";

export type { AgentState };

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState<string>("");
  const [isMicEnabled, setIsMicEnabled] = useState<boolean>(true);
  const [isVoiceMuted, setIsVoiceMuted] = useState<boolean>(false);
  const [dialogue, setDialogue] = useState<{ user?: string; agent?: string; provider?: string } | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [audioBlockedNotice, setAudioBlockedNotice] = useState<boolean>(false);

  const [, startTransition] = useTransition();

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const isSpeakingRef = useRef<boolean>(false);
  const isThinkingRef = useRef<boolean>(false);
  const isMicEnabledRef = useRef<boolean>(true);
  const isVoiceMutedRef = useRef<boolean>(false);
  const needsGestureRef = useRef<boolean>(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const pendingAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const ttsSafetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dialogueTimerRef = useRef<NodeJS.Timeout | null>(null);

  messagesRef.current = messages;
  isMicEnabledRef.current = isMicEnabled;
  isVoiceMutedRef.current = isVoiceMuted;

  const updateStatus = useCallback(
    (newStatus: AgentState) => {
      setStatus(newStatus);
      onAgentStateChange?.(newStatus);
    },
    [onAgentStateChange]
  );

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
      console.warn("Speech recognition auto-start failed, gesture required:", err);
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
      if (typeof window === "undefined") return;
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextClass();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      const t = ctx.currentTime;
      osc.frequency.setValueAtTime(540, t);
      osc.frequency.exponentialRampToValueAtTime(840, t + 0.07);
      gain.gain.setValueAtTime(0.04, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.08);
    } catch {}
  }, []);

  const fallbackSpeechSynthesis = useCallback((text: string, onFinish: () => void) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      onFinish();
      return;
    }

    try {
      window.speechSynthesis.resume();
    } catch {}

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 0.95;
    utterance.volume = 1.0;
    utterance.lang = "en-US";

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const preferredVoice =
        voices.find(
          (v) =>
            v.lang.startsWith("en") &&
            /Google|Natural|Samantha|Daniel|Arthur|Aaron|David|Guy/i.test(v.name)
        ) || voices.find((v) => v.lang.startsWith("en"));
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
    }

    activeUtteranceRef.current = utterance;

    utterance.onend = () => {
      onFinish();
    };

    utterance.onerror = (e) => {
      console.warn("Browser speech synthesis error or interrupted:", e);
      onFinish();
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  const speakReply = useCallback(
    async (text: string) => {
      const cleanText = text
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
      if (audioElementRef.current) {
        try {
          audioElementRef.current.pause();
          audioElementRef.current.currentTime = 0;
        } catch {}
        audioElementRef.current = null;
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

      isSpeakingRef.current = true;
      updateStatus("speaking");
      playJarvisChirp();

      const handleFinished = () => {
        if (ttsSafetyTimeoutRef.current) {
          clearTimeout(ttsSafetyTimeoutRef.current);
          ttsSafetyTimeoutRef.current = null;
        }
        audioElementRef.current = null;
        activeUtteranceRef.current = null;
        setAudioBlockedNotice(false);

        if (!isMountedRef.current) return;
        isSpeakingRef.current = false;
        updateStatus(isMicEnabledRef.current ? "listening" : "idle");
        if (isMicEnabledRef.current) {
          startListening();
        }
      };

      // Safety timeout in case playback events drop
      const estimatedDurationMs = Math.max(4000, (cleanText.length / 10) * 1000 + 3000);
      ttsSafetyTimeoutRef.current = setTimeout(() => {
        if (isSpeakingRef.current) {
          console.warn("TTS safety timer triggered fallback");
          handleFinished();
        }
      }, estimatedDurationMs);

      // 1. Primary: Server-Side Audio Playback (Audible across all OS & browsers)
      try {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: cleanText }),
        });

        if (!response.ok) {
          throw new Error(`TTS server responded with ${response.status}`);
        }

        const audioBlob = await response.blob();
        if (!isMountedRef.current || !isSpeakingRef.current) return;

        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.volume = 1.0;
        audioElementRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          handleFinished();
        };

        audio.onerror = (e) => {
          console.warn("Audio element error, falling back to speech synthesis:", e);
          URL.revokeObjectURL(audioUrl);
          audioElementRef.current = null;
          fallbackSpeechSynthesis(cleanText, handleFinished);
        };

        try {
          await audio.play();
          setAudioBlockedNotice(false);
          return;
        } catch (playErr) {
          if (playErr instanceof DOMException && playErr.name === "NotAllowedError") {
            console.warn("Audio autoplay blocked by browser policy; showing audio unlock prompt");
            pendingAudioRef.current = audio;
            setAudioBlockedNotice(true);
            return;
          }
          throw playErr;
        }
      } catch (err) {
        console.warn("Network TTS playback failed, falling back to speech synthesis:", err);
        fallbackSpeechSynthesis(cleanText, handleFinished);
      }
    },
    [fallbackSpeechSynthesis, playJarvisChirp, startListening, updateStatus]
  );

  const processUtterance = useCallback(
    async (userInput: string) => {
      if (!isMountedRef.current || !userInput.trim()) return;

      const trimmed = userInput.trim();
      isThinkingRef.current = true;
      updateStatus("thinking");

      // Pause speech recognition while processing
      stopListening();

      // Show user message in dialogue
      setDialogue((prev) => ({
        user: trimmed,
        agent: prev?.agent,
        provider: prev?.provider,
      }));

      // Reset auto-dismiss dialogue timer
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
          provider: provider.toUpperCase(),
        });

        isThinkingRef.current = false;
        speakReply(reply);

        // Auto-fade dialogue after 18 seconds of inactivity
        dialogueTimerRef.current = setTimeout(() => {
          if (isMountedRef.current && !isSpeakingRef.current && !isThinkingRef.current) {
            setDialogue(null);
          }
        }, 18000);
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
        speakReply(fallbackReply);
      }
    },
    [speakReply, stopListening, updateStatus]
  );

  const handleTapToStart = useCallback(async () => {
    setNeedsGesture(false);
    needsGestureRef.current = false;
    setAudioBlockedNotice(false);

    if (audioContextRef.current && audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume().catch(() => {});
    }

    // Request audio context & mic permission on user gesture
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch (err) {
        console.warn("Microphone access request failed:", err);
      }
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.resume();
      } catch {}
    }

    setIsMicEnabled(true);
    isMicEnabledRef.current = true;
    startListening();
  }, [startListening]);

  const toggleMic = useCallback(() => {
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
  }, [startListening, stopListening, updateStatus]);

  const toggleVoiceMute = useCallback(() => {
    setIsVoiceMuted((prev) => {
      const next = !prev;
      isVoiceMutedRef.current = next;
      if (next) {
        if (audioElementRef.current) {
          audioElementRef.current.pause();
          audioElementRef.current = null;
        }
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          try {
            window.speechSynthesis.cancel();
          } catch {}
        }
      }
      return next;
    });
  }, []);

  const handleUnlockAudio = useCallback(async () => {
    setAudioBlockedNotice(false);
    if (audioContextRef.current && audioContextRef.current.state === "suspended") {
      try {
        await audioContextRef.current.resume();
      } catch {}
    }
    if (pendingAudioRef.current) {
      try {
        await pendingAudioRef.current.play();
        pendingAudioRef.current = null;
        return;
      } catch {}
    }
    void speakReply("Ultron audio systems online. Voice output is transmitting loud and clear.");
  }, [speakReply]);

  const handleTestVoice = useCallback(() => {
    if (isSpeakingRef.current) {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current = null;
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

    const testPhrase = "Ultron audio systems online. Voice output is transmitting loud and clear.";
    setDialogue({
      agent: testPhrase,
      provider: "AUDIO TEST",
    });
    void speakReply(testPhrase);
  }, [speakReply, updateStatus]);

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text) return;
    setInputValue("");

    if (audioContextRef.current && audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume().catch(() => {});
    }

    void processUtterance(text);
  };

  useEffect(() => {
    const handleFirstInteraction = () => {
      if (audioContextRef.current && audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume().catch(() => {});
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          window.speechSynthesis.resume();
        } catch {}
      }
      if (pendingAudioRef.current) {
        pendingAudioRef.current
          .play()
          .then(() => {
            setAudioBlockedNotice(false);
            pendingAudioRef.current = null;
          })
          .catch(() => {});
      }
    };

    window.addEventListener("click", handleFirstInteraction, { passive: true });
    window.addEventListener("keydown", handleFirstInteraction, { passive: true });
    window.addEventListener("touchstart", handleFirstInteraction, { passive: true });

    return () => {
      window.removeEventListener("click", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
      window.removeEventListener("touchstart", handleFirstInteraction);
    };
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    if (typeof window === "undefined") return;

    const SpeechRecConstructor =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;

    if (!SpeechRecConstructor) {
      updateStatus("unsupported");
      return;
    }

    const recognition = new SpeechRecConstructor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      if (!isSpeakingRef.current && !isThinkingRef.current && isMountedRef.current) {
        updateStatus("listening");
      }
    };

    recognition.onresult = (event: SpeechRecognitionEventItem) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result && result[0]) {
          finalTranscript += result[0].transcript;
        }
      }

      const trimmed = finalTranscript.trim();
      if (trimmed) {
        void processUtterance(trimmed);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventItem) => {
      if (!isMountedRef.current) return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setNeedsGesture(true);
        needsGestureRef.current = true;
      }
    };

    recognition.onend = () => {
      if (!isMountedRef.current) return;

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
        }, 300);
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
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {}
      }
    };
  }, [processUtterance, startListening, updateStatus]);

  return (
    <>
      {/* Top Right Status & Controls */}
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
        {audioBlockedNotice && (
          <button
            type="button"
            onClick={handleUnlockAudio}
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
            🔊 BROWSER AUDIO MUTED — CLICK TO UNMUTE VOICE
          </button>
        )}

        {needsGesture ? (
          <button
            type="button"
            onClick={handleTapToStart}
            className="hud-btn"
            style={{
              height: "auto",
              padding: "8px 16px",
              fontSize: "12px",
              letterSpacing: "0.1em",
              animation: "pulse 2s infinite ease-in-out",
            }}
          >
            TAP TO ACTIVATE VOICE
          </button>
        ) : (
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
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
                      : isMicEnabled
                      ? "#ffaa30"
                      : "#885500",
                  boxShadow:
                    status === "speaking"
                      ? "0 0 10px #ffcc66"
                      : status === "thinking"
                      ? "0 0 10px #ff8800"
                      : isMicEnabled
                      ? "0 0 6px #ffaa30"
                      : "none",
                }}
              />
              <span>
                {status === "speaking" && "TRANSMITTING"}
                {status === "thinking" && "PROCESSING"}
                {status === "listening" && isMicEnabled && "LISTENING"}
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
              background: "rgba(15, 8, 2, 0.85)",
              border: "1px solid rgba(255, 170, 48, 0.5)",
              borderRadius: "6px",
              backdropFilter: "blur(8px)",
              boxShadow: "0 0 24px rgba(255, 140, 20, 0.2) inset, 0 4px 20px rgba(0,0,0,0.8)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {dialogue.user && (
              <div style={{ fontSize: "12px", color: "rgba(255, 200, 100, 0.7)", letterSpacing: "0.05em" }}>
                <span style={{ color: "#ff8800", fontWeight: "bold", marginRight: "6px" }}>&gt; USER:</span>
                &ldquo;{dialogue.user}&rdquo;
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
                }}
              >
                <span style={{ color: "#ffaa30", fontWeight: "bold", marginRight: "6px" }}>[ULTRON]:</span>
                {dialogue.agent}
              </div>
            )}
            {dialogue.provider && (
              <div
                style={{
                  fontSize: "9px",
                  letterSpacing: "0.15em",
                  color: "rgba(255, 170, 48, 0.4)",
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
            background: "rgba(12, 6, 0, 0.92)",
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
            background: "rgba(18, 9, 0, 0.75)",
            border: "1px solid rgba(255, 170, 48, 0.45)",
            borderRadius: "6px",
            padding: "4px 6px 4px 12px",
            backdropFilter: "blur(6px)",
            boxShadow: "0 0 16px rgba(255, 140, 20, 0.15) inset, 0 4px 12px rgba(0,0,0,0.5)",
          }}
        >
          <span style={{ color: "#ffaa30", fontWeight: "bold", fontSize: "14px", opacity: 0.8 }}>&gt;</span>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
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

