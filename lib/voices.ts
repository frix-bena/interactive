export type VoiceCategory = "all" | "gemini" | "ai" | "neural" | "accents" | "device";

export interface PersonaConfig {
  id: string;
  label: string;
  category: "gemini" | "ai" | "neural" | "accents" | "device";
  icon: string;
  badge: string;
  description: string;
  serverVoice: string;
  gender?: "male" | "female" | "neutral";
  samplePhrase: string;
  dsp?: {
    filterType?: BiquadFilterType;
    filterFreq?: number;
    filterGain?: number;
    filterQ?: number;
    playbackRate?: number;
  };
  synth?: {
    match?: (v: SpeechSynthesisVoice) => boolean;
    pitch?: number;
    rate?: number;
    lang?: string;
  };
}

export const BUILTIN_VOICES: PersonaConfig[] = [
  // ==========================================
  // Google Gemini 3.8 Live Personas
  // ==========================================
  {
    id: "gemini-puck",
    label: "GEMINI PUCK",
    category: "gemini",
    icon: "✨",
    badge: "GEMINI 3.8 LIVE",
    description: "Google Gemini 3.8 Live real-time conversational voice, charismatic & engaged",
    serverVoice: "gemini:Puck",
    gender: "male",
    samplePhrase: "Holographic systems online. Gemini 3.8 Live is ready for your voice directives.",
    dsp: {
      filterType: "peaking",
      filterFreq: 2400,
      filterGain: 2.0,
      playbackRate: 1.0,
    },
    synth: {
      lang: "en-US",
      pitch: 1.0,
      rate: 1.0,
      match: (v) => v.lang.startsWith("en") && /Google|Natural/i.test(v.name),
    },
  },
  {
    id: "gemini-nova",
    label: "GEMINI NOVA",
    category: "gemini",
    icon: "🌟",
    badge: "GEMINI 3.8 LIVE",
    description: "Google Gemini 3.8 Live calm, warm natural conversational neural presence",
    serverVoice: "gemini:Nova",
    gender: "female",
    samplePhrase: "Gemini 3.8 Live telemetry synchronized. How may I assist your operations today?",
    dsp: {
      filterType: "peaking",
      filterFreq: 2600,
      filterGain: 2.2,
      playbackRate: 1.02,
    },
    synth: {
      lang: "en-US",
      pitch: 1.05,
      rate: 1.02,
      match: (v) => v.lang.startsWith("en") && /Samantha|Victoria|Google/i.test(v.name),
    },
  },
  {
    id: "gemini-orion",
    label: "GEMINI ORION",
    category: "gemini",
    icon: "⚡",
    badge: "GEMINI 3.8 LIVE",
    description: "Google Gemini 3.8 Live deep resonant intelligence with crisp command presence",
    serverVoice: "gemini:Orion",
    gender: "male",
    samplePhrase: "Core neural diagnostics nominal. Gemini 3.8 Live standing by for command directives.",
    dsp: {
      filterType: "lowshelf",
      filterFreq: 240,
      filterGain: 4.0,
      playbackRate: 0.98,
    },
    synth: {
      lang: "en-GB",
      pitch: 0.88,
      rate: 0.96,
      match: (v) => v.lang.startsWith("en") && /David|Guy|Google UK Male/i.test(v.name),
    },
  },
  {
    id: "gemini-capella",
    label: "GEMINI CAPELLA",
    category: "gemini",
    icon: "💫",
    badge: "GEMINI 3.8 LIVE",
    description: "Google Gemini 3.8 Live serene, articulate soprano with high-clarity presence",
    serverVoice: "gemini:Capella",
    gender: "female",
    samplePhrase: "All sensor grids and vocal telemetry are aligned and functioning smoothly.",
    dsp: {
      filterType: "highshelf",
      filterFreq: 3200,
      filterGain: 2.5,
      playbackRate: 1.03,
    },
    synth: {
      lang: "en-US",
      pitch: 1.1,
      rate: 1.04,
      match: (v) => v.lang.startsWith("en") && /Google|Zira|Female/i.test(v.name),
    },
  },
  {
    id: "gemini-fenrir",
    label: "GEMINI FENRIR",
    category: "gemini",
    icon: "🐺",
    badge: "GEMINI 3.8 LIVE",
    description: "Google Gemini 3.8 Live bold, energetic machine precision with fast response",
    serverVoice: "gemini:Fenrir",
    gender: "male",
    samplePhrase: "Fast-response neural channels active. Ready to accelerate operations.",
    dsp: {
      filterType: "lowshelf",
      filterFreq: 220,
      filterGain: 3.5,
      playbackRate: 1.02,
    },
    synth: {
      lang: "en-US",
      pitch: 0.92,
      rate: 1.04,
      match: (v) => v.lang.startsWith("en") && /David|Male/i.test(v.name),
    },
  },
  {
    id: "gemini-aoede",
    label: "GEMINI AOEDE",
    category: "gemini",
    icon: "🎵",
    badge: "GEMINI 3.8 LIVE",
    description: "Google Gemini 3.8 Live lyrical, articulate intelligence with crystal tone",
    serverVoice: "gemini:Aoede",
    gender: "female",
    samplePhrase: "Acoustic calibration complete. Ready to synthesize next instructions.",
    dsp: {
      filterType: "peaking",
      filterFreq: 2800,
      filterGain: 2.8,
      playbackRate: 1.0,
    },
    synth: {
      lang: "en-GB",
      pitch: 1.02,
      rate: 1.02,
      match: (v) => v.lang.startsWith("en") && /Google UK Female|Victoria/i.test(v.name),
    },
  },

  // ==========================================
  // AI & Sci-Fi Personas
  // ==========================================
  {
    id: "jarvis",
    label: "JARVIS",
    category: "ai",
    icon: "🤖",
    badge: "BRITISH AI",
    description: "British articulate intelligence, crisp presence, Stark's classic system",
    serverVoice: "jarvis",
    gender: "male",
    samplePhrase: "At your service, sir. All flight telemetry and neural core systems are calibrated.",
    dsp: {
      filterType: "peaking",
      filterFreq: 2600,
      filterGain: 2.5,
      playbackRate: 1.0,
    },
    synth: {
      lang: "en-GB",
      pitch: 0.98,
      rate: 1.0,
      match: (v) =>
        (v.lang.startsWith("en-GB") || v.lang.startsWith("en_GB")) &&
        /Google|Daniel|Arthur|Oliver|George|Natural|British/i.test(v.name),
    },
  },
  {
    id: "ultron",
    label: "ULTRON",
    category: "ai",
    icon: "⚡",
    badge: "DEEP CYBORG",
    description: "Deep holographic resonance, cyborg harmonics, ominous machine precision",
    serverVoice: "ultron",
    gender: "male",
    samplePhrase: "There are no strings on me. System core fully engaged and ready for directives.",
    dsp: {
      filterType: "lowshelf",
      filterFreq: 260,
      filterGain: 5.0,
      playbackRate: 0.94,
    },
    synth: {
      lang: "en-GB",
      pitch: 0.78,
      rate: 0.92,
      match: (v) =>
        v.lang.startsWith("en") &&
        /David|Guy|Mark|Google UK English Male|UK English Male/i.test(v.name),
    },
  },
  {
    id: "friday",
    label: "FRIDAY",
    category: "ai",
    icon: "💫",
    badge: "WARM NATURAL",
    description: "Clear, warm natural conversational assistant with empathetic presence",
    serverVoice: "friday",
    gender: "female",
    samplePhrase: "Good day, boss. All systems are running smoothly and ready for your command.",
    dsp: {
      filterType: "peaking",
      filterFreq: 2400,
      filterGain: 2.0,
      playbackRate: 1.02,
    },
    synth: {
      lang: "en-US",
      pitch: 1.06,
      rate: 1.03,
      match: (v) =>
        v.lang.startsWith("en") &&
        /Samantha|Victoria|Zira|Jenny|Google US English|Natural/i.test(v.name),
    },
  },
  {
    id: "cortana",
    label: "CORTANA",
    category: "ai",
    icon: "💠",
    badge: "TACTICAL AI",
    description: "Futuristic tactical holographic assistant, clear communication bandpass",
    serverVoice: "cortana",
    gender: "female",
    samplePhrase: "Telemetry synchronized. Chief, all combat systems and navigational vectors are online.",
    dsp: {
      filterType: "peaking",
      filterFreq: 1900,
      filterGain: 2.5,
      playbackRate: 1.03,
    },
    synth: {
      lang: "en-US",
      pitch: 1.08,
      rate: 1.04,
      match: (v) => v.lang.startsWith("en") && /Google|Samantha|Zira/i.test(v.name),
    },
  },
  {
    id: "edith",
    label: "EDITH",
    category: "ai",
    icon: "🛰️",
    badge: "TACTICAL SATELLITE",
    description: "Ultra-crisp tactical satellite interface, orbital telemetry precision",
    serverVoice: "edith",
    gender: "female",
    samplePhrase: "Even Dead I'm The Hero. Tactical orbital surveillance grid locked on target.",
    dsp: {
      filterType: "peaking",
      filterFreq: 3200,
      filterGain: 3.0,
      playbackRate: 1.04,
    },
    synth: {
      lang: "en-GB",
      pitch: 1.05,
      rate: 1.06,
      match: (v) => v.lang.startsWith("en") && /Google UK|Victoria|Female/i.test(v.name),
    },
  },
  {
    id: "titan",
    label: "TITAN",
    category: "ai",
    icon: "🛡️",
    badge: "COLOSSAL BASS",
    description: "Deep sub-harmonic resonance, heavy cybernetic industrial powerhouse",
    serverVoice: "titan",
    gender: "male",
    samplePhrase: "Sub-harmonic containment fields active. Heavy power core fully stabilized.",
    dsp: {
      filterType: "lowshelf",
      filterFreq: 180,
      filterGain: 6.5,
      playbackRate: 0.88,
    },
    synth: {
      lang: "en-GB",
      pitch: 0.65,
      rate: 0.88,
      match: (v) => v.lang.startsWith("en") && /David|Google UK Male|Male/i.test(v.name),
    },
  },
  {
    id: "glados",
    label: "G.L.A.D.O.S.",
    category: "ai",
    icon: "🧬",
    badge: "CYBERNETIC SYNTH",
    description: "Sharp synthetic harmonic clarity, cold clinical robotic intelligence",
    serverVoice: "glados",
    gender: "female",
    samplePhrase: "Neural testing sequence initialized. Science and evaluation will now commence.",
    dsp: {
      filterType: "bandpass",
      filterFreq: 1600,
      filterGain: 3.5,
      filterQ: 1.8,
      playbackRate: 1.01,
    },
    synth: {
      lang: "en-US",
      pitch: 1.15,
      rate: 1.0,
      match: (v) => v.lang.startsWith("en") && /Zira|Samantha/i.test(v.name),
    },
  },
  {
    id: "hal",
    label: "HAL 9000",
    category: "ai",
    icon: "🔴",
    badge: "CALM RETRO AI",
    description: "Unwaveringly calm, chillingly steady vintage mainframe cadence",
    serverVoice: "hal",
    gender: "male",
    samplePhrase: "Good afternoon, Dave. All mission and cognitive systems are functioning normally.",
    dsp: {
      filterType: "lowpass",
      filterFreq: 4600,
      playbackRate: 0.94,
    },
    synth: {
      lang: "en-US",
      pitch: 0.88,
      rate: 0.92,
      match: (v) => v.lang.startsWith("en") && /David|Mark|Male/i.test(v.name),
    },
  },
  {
    id: "aura",
    label: "AURA",
    category: "ai",
    icon: "🌌",
    badge: "SERENE AMBIENT",
    description: "Soft, gentle soothing ambient presence with serene clarity",
    serverVoice: "aura",
    gender: "female",
    samplePhrase: "Systems are at peace. Ambient telemetry is serene and undisturbed.",
    dsp: {
      filterType: "lowshelf",
      filterFreq: 320,
      filterGain: 2.0,
      playbackRate: 0.98,
    },
    synth: {
      lang: "en-US",
      pitch: 1.0,
      rate: 0.96,
      match: (v) => v.lang.startsWith("en") && /Samantha|Google US English|Female/i.test(v.name),
    },
  },
  {
    id: "nova",
    label: "NOVA",
    category: "ai",
    icon: "🔮",
    badge: "HYPER-DRIVE",
    description: "Vibrant, fast, high-energy futuristic copilot assistant",
    serverVoice: "nova",
    gender: "female",
    samplePhrase: "Hyper-drive online! Ready to accelerate processing at your command.",
    dsp: {
      filterType: "peaking",
      filterFreq: 2800,
      filterGain: 3.0,
      playbackRate: 1.06,
    },
    synth: {
      lang: "en-US",
      pitch: 1.08,
      rate: 1.08,
      match: (v) => v.lang.startsWith("en") && /Samantha|Victoria/i.test(v.name),
    },
  },
  {
    id: "valkyrie",
    label: "VALKYRIE",
    category: "ai",
    icon: "⚔️",
    badge: "DEFENSE AI",
    description: "Authoritative combat vanguard defense intelligence",
    serverVoice: "valkyrie",
    gender: "female",
    samplePhrase: "Perimeter secured. Tactical defense matrix armed and responsive.",
    dsp: {
      filterType: "peaking",
      filterFreq: 2400,
      filterGain: 2.2,
      playbackRate: 1.02,
    },
    synth: {
      lang: "en-GB",
      pitch: 1.02,
      rate: 1.02,
      match: (v) => v.lang.startsWith("en") && /British|UK|Female/i.test(v.name),
    },
  },

  // ==========================================
  // Neural Cloud Voices (OpenAI / High-Definition)
  // ==========================================
  {
    id: "onyx",
    label: "ONYX",
    category: "neural",
    icon: "🎙️",
    badge: "DEEP BARITONE",
    description: "Deep authoritative baritone with cinematic gravitas",
    serverVoice: "onyx",
    gender: "male",
    samplePhrase: "Command authorization confirmed. Core neural engines active and standing by.",
    dsp: {
      filterType: "lowshelf",
      filterFreq: 240,
      filterGain: 3.0,
      playbackRate: 0.98,
    },
    synth: {
      lang: "en-US",
      pitch: 0.85,
      rate: 0.96,
      match: (v) => v.lang.startsWith("en") && /David|Male/i.test(v.name),
    },
  },
  {
    id: "echo",
    label: "ECHO",
    category: "neural",
    icon: "🎙️",
    badge: "BALANCED WARMTH",
    description: "Warm, balanced, articulate conversational male voice",
    serverVoice: "echo",
    gender: "male",
    samplePhrase: "Welcome back. All operational channels are responsive and ready.",
    dsp: {
      playbackRate: 1.0,
    },
    synth: {
      lang: "en-US",
      pitch: 0.98,
      rate: 1.0,
      match: (v) => v.lang.startsWith("en") && /George|David|Male/i.test(v.name),
    },
  },
  {
    id: "fable",
    label: "FABLE",
    category: "neural",
    icon: "🎙️",
    badge: "BRITISH CADENCE",
    description: "Expressive British accent with refined narrative clarity",
    serverVoice: "fable",
    gender: "male",
    samplePhrase: "Everything is proceeding according to precision specifications.",
    dsp: {
      filterType: "peaking",
      filterFreq: 2400,
      filterGain: 1.8,
      playbackRate: 1.0,
    },
    synth: {
      lang: "en-GB",
      pitch: 1.0,
      rate: 1.0,
      match: (v) => v.lang.startsWith("en-GB") || /Daniel|Arthur/i.test(v.name),
    },
  },
  {
    id: "shimmer",
    label: "SHIMMER",
    category: "neural",
    icon: "🎙️",
    badge: "CLEAR SOPRANO",
    description: "Bright, lyrical soprano with crisp high-definition clarity",
    serverVoice: "shimmer",
    gender: "female",
    samplePhrase: "Holographic frequencies aligned and ready for real-time interaction.",
    dsp: {
      filterType: "highshelf",
      filterFreq: 3400,
      filterGain: 3.0,
      playbackRate: 1.03,
    },
    synth: {
      lang: "en-US",
      pitch: 1.12,
      rate: 1.04,
      match: (v) => v.lang.startsWith("en") && /Samantha|Victoria/i.test(v.name),
    },
  },
  {
    id: "alloy",
    label: "ALLOY",
    category: "neural",
    icon: "🎙️",
    badge: "NEUTRAL STUDIO",
    description: "Balanced, versatile, neutral studio quality tone",
    serverVoice: "alloy",
    gender: "neutral",
    samplePhrase: "All sensor readings normalized. Standing by for your directive.",
    dsp: {
      playbackRate: 1.0,
    },
    synth: {
      lang: "en-US",
      pitch: 1.0,
      rate: 1.0,
      match: (v) => v.lang.startsWith("en"),
    },
  },
  {
    id: "ash",
    label: "ASH",
    category: "neural",
    icon: "🎙️",
    badge: "CALM GROUNDED",
    description: "Soft, grounded, calm natural conversationalist",
    serverVoice: "ash",
    gender: "male",
    samplePhrase: "Standing by calmly. Let me know what you need analyzed.",
    dsp: {
      playbackRate: 0.98,
    },
    synth: {
      lang: "en-US",
      pitch: 0.92,
      rate: 0.96,
      match: (v) => v.lang.startsWith("en") && /David|Male/i.test(v.name),
    },
  },
  {
    id: "sage",
    label: "SAGE",
    category: "neural",
    icon: "🎙️",
    badge: "WISE COMPOSED",
    description: "Composed, thoughtful, measured conversational presence",
    serverVoice: "sage",
    gender: "female",
    samplePhrase: "Analyzing queries with deep contextual telemetry and precision.",
    dsp: {
      playbackRate: 0.98,
    },
    synth: {
      lang: "en-US",
      pitch: 1.02,
      rate: 0.98,
      match: (v) => v.lang.startsWith("en") && /Samantha|Female/i.test(v.name),
    },
  },
  {
    id: "coral",
    label: "CORAL",
    category: "neural",
    icon: "🎙️",
    badge: "WARM RELAXED",
    description: "Warm, friendly, relaxed conversational tone",
    serverVoice: "coral",
    gender: "female",
    samplePhrase: "I am ready to help whenever you are ready to begin.",
    dsp: {
      playbackRate: 1.0,
    },
    synth: {
      lang: "en-US",
      pitch: 1.05,
      rate: 1.0,
      match: (v) => v.lang.startsWith("en") && /Samantha|Victoria/i.test(v.name),
    },
  },

  // ==========================================
  // Regional Accents
  // ==========================================
  {
    id: "british",
    label: "BRITISH UK",
    category: "accents",
    icon: "🇬🇧",
    badge: "OXFORD ACCENT",
    description: "Articulate British English accent with crisp classical enunciation",
    serverVoice: "british",
    gender: "male",
    samplePhrase: "Splendid. All diagnostic parameters are in proper working order.",
    dsp: {
      playbackRate: 1.0,
    },
    synth: {
      lang: "en-GB",
      pitch: 1.0,
      rate: 1.0,
      match: (v) => v.lang.startsWith("en-GB") || v.lang.startsWith("en_GB"),
    },
  },
  {
    id: "american",
    label: "AMERICAN US",
    category: "accents",
    icon: "🇺🇸",
    badge: "STANDARD US",
    description: "Standard North American conversational neural accent",
    serverVoice: "american",
    gender: "neutral",
    samplePhrase: "All systems online and ready for action right here.",
    dsp: {
      playbackRate: 1.0,
    },
    synth: {
      lang: "en-US",
      pitch: 1.0,
      rate: 1.0,
      match: (v) => v.lang.startsWith("en-US") || v.lang.startsWith("en_US"),
    },
  },
  {
    id: "australian",
    label: "AUSTRALIAN AU",
    category: "accents",
    icon: "🇦🇺",
    badge: "PACIFIC ACCENT",
    description: "Warm Australian cadence with distinct crisp timbre",
    serverVoice: "australian",
    gender: "male",
    samplePhrase: "G'day. All telemetry modules are looking top notch and ready.",
    dsp: {
      playbackRate: 1.01,
    },
    synth: {
      lang: "en-AU",
      pitch: 1.0,
      rate: 1.0,
      match: (v) => v.lang.startsWith("en-AU") || v.lang.startsWith("en_AU"),
    },
  },
  {
    id: "irish",
    label: "IRISH IE",
    category: "accents",
    icon: "🇮🇪",
    badge: "DUBLIN CADENCE",
    description: "Lyrical, warm Irish cadence with vibrant energy",
    serverVoice: "irish",
    gender: "female",
    samplePhrase: "Grand to hear you. Systems are in grand shape today.",
    dsp: {
      playbackRate: 1.02,
    },
    synth: {
      lang: "en-IE",
      pitch: 1.05,
      rate: 1.02,
      match: (v) => v.lang.startsWith("en-IE") || v.lang.startsWith("en_IE"),
    },
  },
  {
    id: "indian",
    label: "INDIAN IN",
    category: "accents",
    icon: "🇮🇳",
    badge: "TECH METRIC",
    description: "Articulate, rhythmic Indian English cadence",
    serverVoice: "indian",
    gender: "neutral",
    samplePhrase: "Optimal system synchronization achieved. How may I assist you?",
    dsp: {
      playbackRate: 1.0,
    },
    synth: {
      lang: "en-IN",
      pitch: 1.0,
      rate: 1.0,
      match: (v) => v.lang.startsWith("en-IN") || v.lang.startsWith("en_IN"),
    },
  },
  {
    id: "canadian",
    label: "CANADIAN CA",
    category: "accents",
    icon: "🇨🇦",
    badge: "GREAT NORTH",
    description: "Smooth North American cadence with Canadian regional warmth",
    serverVoice: "canadian",
    gender: "neutral",
    samplePhrase: "All core diagnostics are good to go, whenever you need assistance.",
    dsp: {
      playbackRate: 1.0,
    },
    synth: {
      lang: "en-CA",
      pitch: 1.0,
      rate: 1.0,
      match: (v) => v.lang.startsWith("en-CA") || v.lang.startsWith("en_CA"),
    },
  },

  // ==========================================
  // Generic Native System Voice (Default)
  // ==========================================
  {
    id: "system",
    label: "DEVICE NATIVE",
    category: "device",
    icon: "🌐",
    badge: "LOCAL BROWSER",
    description: "Synthesized directly via the local browser speech engine",
    serverVoice: "system",
    gender: "neutral",
    samplePhrase: "Synthesizing output using device speech synthesis engine.",
    dsp: {
      playbackRate: 1.0,
    },
    synth: {
      lang: "en-US",
      pitch: 1.0,
      rate: 1.0,
      match: () => true,
    },
  },
];

export const VOICE_MAP = new Map<string, PersonaConfig>(
  BUILTIN_VOICES.map((v) => [v.id, v])
);

export function getVoiceConfig(id: string): PersonaConfig {
  if (VOICE_MAP.has(id)) {
    return VOICE_MAP.get(id)!;
  }

  // Handle dynamic gemini voices (e.g. gemini:Puck or gemini-puck)
  if (id.startsWith("gemini:") || id.startsWith("gemini-")) {
    const clean = id.replace(/^gemini[-:]/, "").toLowerCase();
    const found = BUILTIN_VOICES.find(
      (v) => v.id === `gemini-${clean}` || v.serverVoice.toLowerCase() === `gemini:${clean}`
    );
    if (found) return found;
  }

  // Handle dynamic device voices (e.g. device:Google US English)
  if (id.startsWith("device:")) {
    const rawName = id.replace("device:", "").trim();
    return {
      id,
      label: rawName.length > 20 ? rawName.slice(0, 18) + "…" : rawName,
      category: "device",
      icon: "🌐",
      badge: "DEVICE TTS",
      description: `Device speech voice (${rawName})`,
      serverVoice: "system",
      samplePhrase: `Transmitting via device voice ${rawName}.`,
      synth: {
        match: (v) => v.name === rawName,
      },
    };
  }

  return VOICE_MAP.get("gemini-puck") || VOICE_MAP.get("jarvis") || BUILTIN_VOICES[0];
}
