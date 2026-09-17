"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import {
  BUILTIN_VOICES,
  type PersonaConfig,
  type VoiceCategory,
  getVoiceConfig,
} from "@/lib/voices";

interface VoiceSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedVoice: string;
  onSelectVoice: (voiceId: string) => void;
  onPreviewVoice: (voiceId: string, samplePhrase: string) => void;
  previewingVoiceId?: string | null;
  voiceRate: number;
  onVoiceRateChange: (rate: number) => void;
  voicePitch: number;
  onVoicePitchChange: (pitch: number) => void;
}

export default function VoiceSelectorModal({
  isOpen,
  onClose,
  selectedVoice,
  onSelectVoice,
  onPreviewVoice,
  previewingVoiceId,
  voiceRate,
  onVoiceRateChange,
  voicePitch,
  onVoicePitchChange,
}: VoiceSelectorModalProps) {
  const [activeCategory, setActiveCategory] = useState<VoiceCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [deviceVoices, setDeviceVoices] = useState<PersonaConfig[]>([]);
  const modalRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load device speech synthesis voices asynchronously
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const loadVoices = () => {
      const raw = window.speechSynthesis.getVoices();
      if (!raw || raw.length === 0) return;

      // Filter and map to PersonaConfig
      const mapped: PersonaConfig[] = raw.map((v) => {
        const isEnglish = v.lang.startsWith("en");
        return {
          id: `device:${v.name}`,
          label: v.name,
          category: "device",
          icon: "🌐",
          badge: v.lang.toUpperCase(),
          description: `${v.lang}${v.localService ? " · Local" : " · Cloud"} (${v.name})`,
          serverVoice: "system",
          gender: /female|woman|girl/i.test(v.name)
            ? "female"
            : /male|man|boy/i.test(v.name)
            ? "male"
            : "neutral",
          samplePhrase: `Transmitting synthesized speech with device voice: ${v.name}.`,
          synth: {
            match: (item) => item.name === v.name,
          },
        };
      });

      // Sort: English first, then alphabetical
      mapped.sort((a, b) => {
        const aEn = a.badge.startsWith("EN");
        const bEn = b.badge.startsWith("EN");
        if (aEn && !bEn) return -1;
        if (!aEn && bEn) return 1;
        return a.label.localeCompare(b.label);
      });

      setDeviceVoices(mapped);
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Combine built-in voices and dynamic device voices
  const allVoices = useMemo(() => {
    return [...BUILTIN_VOICES, ...deviceVoices];
  }, [deviceVoices]);

  // Filter voices by category & search query
  const filteredVoices = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return allVoices.filter((v) => {
      if (activeCategory !== "all" && v.category !== activeCategory) {
        return false;
      }
      if (!q) return true;
      return (
        v.label.toLowerCase().includes(q) ||
        v.badge.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        v.id.toLowerCase().includes(q)
      );
    });
  }, [allVoices, activeCategory, searchQuery]);

  const counts = useMemo(() => {
    return {
      all: allVoices.length,
      gemini: allVoices.filter((v) => v.category === "gemini").length,
      ai: allVoices.filter((v) => v.category === "ai").length,
      neural: allVoices.filter((v) => v.category === "neural").length,
      accents: allVoices.filter((v) => v.category === "accents").length,
      device: allVoices.filter((v) => v.category === "device").length,
    };
  }, [allVoices]);

  if (!isOpen) return null;

  const currentConfig = getVoiceConfig(selectedVoice);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="hud"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "760px",
          maxHeight: "90vh",
          background: "rgba(16, 8, 2, 0.96)",
          border: "1px solid rgba(255, 170, 48, 0.7)",
          borderRadius: "8px",
          backdropFilter: "blur(16px)",
          boxShadow: "0 0 35px rgba(255, 140, 20, 0.35), 0 10px 40px rgba(0, 0, 0, 0.9)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          pointerEvents: "auto",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255, 170, 48, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(25, 12, 0, 0.8)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "20px" }}>🎙️</span>
            <div>
              <div
                style={{
                  color: "#ffdd66",
                  fontSize: "14px",
                  fontWeight: "bold",
                  letterSpacing: "0.1em",
                }}
              >
                SELECT NEURAL VOICE TELEMETRY
              </div>
              <div
                style={{
                  color: "rgba(255, 170, 48, 0.7)",
                  fontSize: "10px",
                  letterSpacing: "0.05em",
                }}
              >
                Choose from Google Gemini 3.8 Live, Stark AI personas, Neural Cloud HD, and accents
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="hud-btn"
            style={{
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              fontSize: "16px",
              color: "#ffdd66",
            }}
          >
            ✕
          </button>
        </div>

        {/* Search & Category Tabs Bar */}
        <div
          style={{
            padding: "12px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            borderBottom: "1px solid rgba(255, 170, 48, 0.2)",
            background: "rgba(10, 5, 0, 0.5)",
          }}
        >
          {/* Search Box */}
          <div style={{ position: "relative", width: "100%" }}>
            <span
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                opacity: 0.6,
                fontSize: "13px",
              }}
            >
              🔍
            </span>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search voices by persona, accent, or keyword..."
              style={{
                width: "100%",
                height: "36px",
                padding: "0 12px 0 34px",
                background: "rgba(30, 15, 0, 0.7)",
                border: "1px solid rgba(255, 170, 48, 0.4)",
                borderRadius: "4px",
                color: "#ffdd66",
                fontFamily: '"Courier New", monospace',
                fontSize: "12px",
                letterSpacing: "0.05em",
                outline: "none",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#ffcc66";
                e.target.style.boxShadow = "0 0 10px rgba(255, 170, 48, 0.4)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "rgba(255, 170, 48, 0.4)";
                e.target.style.boxShadow = "none";
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "rgba(255, 170, 48, 0.7)",
                  cursor: "pointer",
                  fontSize: "12px",
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Filter Tabs */}
          <div
            style={{
              display: "flex",
              gap: "6px",
              overflowX: "auto",
              paddingBottom: "2px",
            }}
          >
            {(
              [
                { id: "all", label: "ALL VOICES", count: counts.all },
                { id: "gemini", label: "✨ GEMINI 3.8 LIVE", count: counts.gemini },
                { id: "ai", label: "🤖 AI PERSONAS", count: counts.ai },
                { id: "neural", label: "🎙️ NEURAL CLOUD", count: counts.neural },
                { id: "accents", label: "🌐 REGIONAL", count: counts.accents },
                { id: "device", label: "💻 DEVICE NATIVE", count: counts.device },
              ] as { id: VoiceCategory; label: string; count: number }[]
            ).map((cat) => {
              const isSelected = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  style={{
                    padding: "5px 10px",
                    background: isSelected ? "rgba(255, 170, 48, 0.25)" : "rgba(30, 15, 0, 0.5)",
                    border: isSelected ? "1px solid #ffcc66" : "1px solid rgba(255, 170, 48, 0.3)",
                    borderRadius: "4px",
                    color: isSelected ? "#ffdd66" : "rgba(255, 170, 48, 0.7)",
                    fontFamily: '"Courier New", monospace',
                    fontSize: "11px",
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span>{cat.label}</span>
                  <span
                    style={{
                      fontSize: "9px",
                      opacity: 0.8,
                      padding: "1px 5px",
                      borderRadius: "10px",
                      background: isSelected ? "rgba(255, 170, 48, 0.35)" : "rgba(0,0,0,0.3)",
                    }}
                  >
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Voice Grid */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 20px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "12px",
            maxHeight: "440px",
          }}
        >
          {filteredVoices.length === 0 ? (
            <div
              style={{
                gridColumn: "1 / -1",
                padding: "36px 0",
                textAlign: "center",
                color: "rgba(255, 170, 48, 0.6)",
                fontSize: "12px",
              }}
            >
              No voices found matching &ldquo;{searchQuery}&rdquo;.
            </div>
          ) : (
            filteredVoices.map((v) => {
              const isSelected = v.id === selectedVoice;
              const isPreviewing = previewingVoiceId === v.id;

              return (
                <div
                  key={v.id}
                  onClick={() => onSelectVoice(v.id)}
                  style={{
                    position: "relative",
                    padding: "12px",
                    background: isSelected
                      ? "rgba(255, 150, 20, 0.16)"
                      : "rgba(25, 12, 0, 0.65)",
                    border: isSelected
                      ? "1px solid #ffcc66"
                      : "1px solid rgba(255, 170, 48, 0.3)",
                    borderRadius: "6px",
                    boxShadow: isSelected
                      ? "0 0 16px rgba(255, 170, 48, 0.35), inset 0 0 12px rgba(255, 140, 20, 0.15)"
                      : "none",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "8px",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = "rgba(255, 170, 48, 0.7)";
                      e.currentTarget.style.background = "rgba(45, 22, 0, 0.75)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = "rgba(255, 170, 48, 0.3)";
                      e.currentTarget.style.background = "rgba(25, 12, 0, 0.65)";
                    }
                  }}
                >
                  {/* Top Row: Icon + Label + Badge */}
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "6px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "18px" }}>{v.icon}</span>
                        <div>
                          <span
                            style={{
                              fontSize: "13px",
                              fontWeight: "bold",
                              color: isSelected ? "#ffdd66" : "#ffaa30",
                              letterSpacing: "0.08em",
                            }}
                          >
                            {v.label}
                          </span>
                          {v.gender && (
                            <span
                              style={{
                                marginLeft: "6px",
                                fontSize: "9px",
                                opacity: 0.65,
                                textTransform: "uppercase",
                              }}
                            >
                              ({v.gender})
                            </span>
                          )}
                        </div>
                      </div>

                      {isSelected ? (
                        <span
                          style={{
                            fontSize: "9px",
                            fontWeight: "bold",
                            color: "#000",
                            background: "#ffcc66",
                            padding: "2px 6px",
                            borderRadius: "3px",
                            letterSpacing: "0.08em",
                          }}
                        >
                          ACTIVE
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: "9px",
                            opacity: 0.65,
                            letterSpacing: "0.06em",
                            color: "#ffaa30",
                            background: "rgba(255, 170, 48, 0.1)",
                            padding: "2px 5px",
                            borderRadius: "3px",
                          }}
                        >
                          {v.badge}
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <div
                      style={{
                        fontSize: "10.5px",
                        lineHeight: "1.4",
                        color: isSelected ? "rgba(255, 230, 180, 0.95)" : "rgba(255, 190, 100, 0.75)",
                        marginTop: "6px",
                      }}
                    >
                      {v.description}
                    </div>
                  </div>

                  {/* Bottom Row: Preview Button & Action */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: "6px",
                      paddingTop: "6px",
                      borderTop: "1px solid rgba(255, 170, 48, 0.15)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPreviewVoice(v.id, v.samplePhrase);
                      }}
                      className="hud-btn"
                      style={{
                        height: "26px",
                        padding: "0 8px",
                        fontSize: "10px",
                        letterSpacing: "0.08em",
                        borderRadius: "3px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        color: isPreviewing ? "#ffdd66" : "#ffaa30",
                        borderColor: isPreviewing ? "#ffcc66" : "rgba(255, 170, 48, 0.4)",
                        background: isPreviewing ? "rgba(255, 170, 48, 0.3)" : undefined,
                      }}
                      title="Listen to voice sample"
                    >
                      <span>{isPreviewing ? "🔊" : "▶"}</span>
                      <span>{isPreviewing ? "PLAYING..." : "PREVIEW"}</span>
                    </button>

                    <span
                      style={{
                        fontSize: "10px",
                        letterSpacing: "0.06em",
                        color: isSelected ? "#ffcc66" : "rgba(255, 170, 48, 0.5)",
                      }}
                    >
                      {isSelected ? "SELECTED ✓" : "CLICK TO SET"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer with Speed & Pitch Audio Sliders */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid rgba(255, 170, 48, 0.3)",
            background: "rgba(20, 10, 0, 0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          {/* Rate / Speed Slider */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: "1 1 200px" }}>
            <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#ffaa30", whiteSpace: "nowrap" }}>
              SPEED: {voiceRate.toFixed(2)}x
            </span>
            <input
              type="range"
              min="0.8"
              max="1.4"
              step="0.05"
              value={voiceRate}
              onChange={(e) => onVoiceRateChange(parseFloat(e.target.value))}
              style={{
                flex: 1,
                accentColor: "#ffaa30",
                cursor: "pointer",
              }}
            />
            {voiceRate !== 1.0 && (
              <button
                type="button"
                onClick={() => onVoiceRateChange(1.0)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255, 170, 48, 0.6)",
                  fontSize: "9px",
                  cursor: "pointer",
                  letterSpacing: "0.05em",
                }}
                title="Reset speed to 1.0x"
              >
                RESET
              </button>
            )}
          </div>

          {/* Pitch Slider */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: "1 1 200px" }}>
            <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#ffaa30", whiteSpace: "nowrap" }}>
              PITCH: {voicePitch.toFixed(2)}x
            </span>
            <input
              type="range"
              min="0.75"
              max="1.3"
              step="0.05"
              value={voicePitch}
              onChange={(e) => onVoicePitchChange(parseFloat(e.target.value))}
              style={{
                flex: 1,
                accentColor: "#ffaa30",
                cursor: "pointer",
              }}
            />
            {voicePitch !== 1.0 && (
              <button
                type="button"
                onClick={() => onVoicePitchChange(1.0)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255, 170, 48, 0.6)",
                  fontSize: "9px",
                  cursor: "pointer",
                  letterSpacing: "0.05em",
                }}
                title="Reset pitch to 1.0x"
              >
                RESET
              </button>
            )}
          </div>

          {/* Close / Apply button */}
          <button
            type="button"
            onClick={onClose}
            className="hud-btn voice-action-btn"
            style={{
              height: "32px",
              padding: "0 16px",
              fontSize: "11px",
              letterSpacing: "0.1em",
              borderRadius: "4px",
            }}
          >
            CONFIRM &amp; CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}
