"use client";

import { useEffect, useRef, useState, useCallback } from "react";

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

export default function VoiceBot() {
  const [status, setStatus] = useState<"listening" | "thinking" | "speaking" | "unsupported">("listening");
  const [needsGesture, setNeedsGesture] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const isSpeakingRef = useRef<boolean>(false);
  const isThinkingRef = useRef<boolean>(false);
  const isListeningRef = useRef<boolean>(false);
  const needsGestureRef = useRef<boolean>(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const ttsSafetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync messagesRef with state
  messagesRef.current = messages;

  const startListening = useCallback(() => {
    if (!isMountedRef.current || isSpeakingRef.current || isThinkingRef.current) {
      return;
    }
    const recognition = recognitionRef.current;
    if (!recognition) return;

    try {
      recognition.start();
      setNeedsGesture(false);
      needsGestureRef.current = false;
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "InvalidStateError") {
        // Already active
        return;
      }
      console.warn("Speech recognition auto-start failed, gesture required:", err);
      setNeedsGesture(true);
      needsGestureRef.current = true;
    }
  }, []);

  const speakReply = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        isSpeakingRef.current = false;
        setStatus("listening");
        startListening();
        return;
      }

      isSpeakingRef.current = true;
      setStatus("speaking");

      try {
        window.speechSynthesis.cancel();
      } catch {}

      if (ttsSafetyTimeoutRef.current) {
        clearTimeout(ttsSafetyTimeoutRef.current);
        ttsSafetyTimeoutRef.current = null;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.lang = "en-US";
      activeUtteranceRef.current = utterance;

      const handleFinished = () => {
        if (ttsSafetyTimeoutRef.current) {
          clearTimeout(ttsSafetyTimeoutRef.current);
          ttsSafetyTimeoutRef.current = null;
        }
        activeUtteranceRef.current = null;
        if (!isMountedRef.current) return;
        isSpeakingRef.current = false;
        setStatus("listening");
        // Resume listening automatically after speaking
        startListening();
      };

      utterance.onend = () => {
        handleFinished();
      };

      utterance.onerror = (e) => {
        console.warn("Speech synthesis error:", e);
        handleFinished();
      };

      // Fallback timer in case onend doesn't fire
      const estimatedDurationMs = Math.max(3000, (text.length / 15) * 1000 + 3000);
      ttsSafetyTimeoutRef.current = setTimeout(() => {
        if (isSpeakingRef.current) {
          console.warn("TTS safety timer triggered fallback");
          handleFinished();
        }
      }, estimatedDurationMs);

      window.speechSynthesis.speak(utterance);
    },
    [startListening]
  );

  const processUtterance = useCallback(
    async (spokenText: string) => {
      if (!isMountedRef.current) return;

      isThinkingRef.current = true;
      setStatus("thinking");

      // Pause recognition while processing and speaking
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }

      const userMessage: ChatMessage = { role: "user", content: spokenText };
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
          throw new Error(`API returned status ${response.status}`);
        }

        const data = await response.json();
        const reply = typeof data?.reply === "string" ? data.reply : "";

        if (!isMountedRef.current) return;

        if (reply.trim()) {
          const assistantMessage: ChatMessage = { role: "assistant", content: reply.trim() };
          const finalHistory = [...messagesRef.current, assistantMessage].slice(-20);
          setMessages(finalHistory);
          messagesRef.current = finalHistory;

          isThinkingRef.current = false;
          speakReply(reply.trim());
        } else {
          isThinkingRef.current = false;
          setStatus("listening");
          startListening();
        }
      } catch (error) {
        console.error("Error communicating with /api/chat:", error);
        if (!isMountedRef.current) return;
        isThinkingRef.current = false;
        setStatus("listening");
        startListening();
      }
    },
    [speakReply, startListening]
  );

  const handleTapToStart = useCallback(async () => {
    setNeedsGesture(false);
    needsGestureRef.current = false;

    // Trigger microphone permission prompt on user gesture
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch (err) {
        console.warn("Microphone access request failed:", err);
      }
    }

    startListening();
  }, [startListening]);

  useEffect(() => {
    isMountedRef.current = true;

    if (typeof window === "undefined") return;

    const SpeechRecConstructor =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;

    if (!SpeechRecConstructor) {
      setStatus("unsupported");
      return;
    }

    const recognition = new SpeechRecConstructor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      isListeningRef.current = true;
      if (!isSpeakingRef.current && !isThinkingRef.current && isMountedRef.current) {
        setStatus("listening");
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
      isListeningRef.current = false;
      if (!isMountedRef.current) return;

      // Auto-restart listening if not currently speaking, thinking, or blocked
      if (!isSpeakingRef.current && !isThinkingRef.current && !needsGestureRef.current) {
        if (restartTimeoutRef.current) {
          clearTimeout(restartTimeoutRef.current);
        }
        restartTimeoutRef.current = setTimeout(() => {
          if (
            isMountedRef.current &&
            !isSpeakingRef.current &&
            !isThinkingRef.current &&
            !needsGestureRef.current
          ) {
            startListening();
          }
        }, 300);
      }
    };

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
  }, [processUtterance, startListening]);

  // Display status indicator
  if (status === "unsupported") {
    return (
      <div
        className="hud"
        style={{
          top: "24px",
          right: "24px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 14px",
          background: "rgba(20, 10, 0, 0.65)",
          border: "1px solid rgba(255, 170, 48, 0.4)",
          borderRadius: "4px",
          fontSize: "11px",
          letterSpacing: "0.1em",
          color: "rgba(255, 170, 48, 0.7)",
          backdropFilter: "blur(2px)",
          boxShadow: "0 0 12px rgba(255, 140, 20, 0.12) inset",
          pointerEvents: "none",
        }}
      >
        <span>VOICE UNSUPPORTED</span>
      </div>
    );
  }

  return (
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
          Tap to start talking
        </button>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "8px 16px",
            background: "rgba(20, 10, 0, 0.65)",
            border: "1px solid rgba(255, 170, 48, 0.45)",
            borderRadius: "4px",
            fontSize: "12px",
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
                  : "#ffaa30",
              boxShadow:
                status === "speaking"
                  ? "0 0 8px #ffcc66"
                  : status === "thinking"
                  ? "0 0 8px #ff8800"
                  : "0 0 6px #ffaa30",
            }}
          />
          <span>
            {status === "listening" && "Listening…"}
            {status === "thinking" && "Thinking…"}
            {status === "speaking" && "Speaking…"}
          </span>
        </div>
      )}
    </div>
  );
}
