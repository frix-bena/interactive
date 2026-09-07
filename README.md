# ULTRON Orb UI

An Iron Man–inspired holographic orb built with **Next.js**, **Three.js**, and **MediaPipe** hand tracking — control it with your bare hands through your webcam.

> 🔮 This is the open-source **interface** of [ULTRON](https://sagartamang.com/projects/ultron) — my AI that talks in real time and controls Android devices by itself. **[Read the write-up](https://sagartamang.com/projects/ultron)** or **[the X post](https://x.com/sagar_builds/status/2077277583646101921)**

> 📱 **[Watch the demo on Instagram](https://www.instagram.com/p/DayJ17OTwvx/)**

![ULTRON orb UI](docs/screenshot.png)

https://github.com/user-attachments/assets/91578a83-9a27-44e8-84b0-96defcfd7366

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Controls

### Mouse / touch

| Input | Action |
| --- | --- |
| Drag | Spin the orb |
| Scroll / pinch | Zoom in & out |

### Hand gestures (webcam)

Click **GESTURES OFF** (or press `G`) and allow camera access, then:

| Gesture | Action |
| --- | --- |
| Pinch (thumb + index) one hand and move it | Spin the orb |
| Pinch with **both** hands, spread apart / bring together | Zoom in / out |

### Keyboard

| Key | Action |
| --- | --- |
| `G` | Toggle hand gestures |
| `R` | Reset the view |
| `+` / `−` | Zoom in / out |
| `V` | Voice reply mode / Stop speaking & reply |
| `ESC` | Stop assistant speech & reply by voice, or cancel speech |
| `Space` | (outside text input) Stop speaking & reply, or stop assistant |

## How it works

- **`lib/orbScene.ts`** — the Three.js scene: layered wireframe shells, a spiral
  inner core, floating code-text sprites, orbiting debris, dust particles, scan
  rings, and a bloom + chromatic-aberration post-processing stack.
- **`lib/handTracker.ts`** — MediaPipe HandLandmarker running on the webcam
  feed. Pinch detection with hysteresis: one pinched hand spins the orb, two
  pinched hands zoom by spreading apart or together.
- **`components/JarvisOrb.tsx`** — the HUD and glue between the scene, the
  tracker, and your inputs.

## License

MIT

## Voice & Text AI Assistant

The application includes an integrated real-time holographic AI assistant powered by Anthropic Claude, OpenAI / Groq, Google Gemini, or a built-in offline engine.

### Setup (Optional)

You can run the assistant right away without any keys using the built-in offline engine. To enable cloud LLMs, create a `.env.local` file in the project root:

```bash
cp .env.local.example .env.local
```

Then edit `.env.local` with your preferred provider:

```env
# Anthropic Claude
ANTHROPIC_API_KEY=your-anthropic-api-key
ANTHROPIC_MODEL=claude-3-5-haiku-20241022

# Or OpenAI / Groq
# OPENAI_API_KEY=your-openai-or-groq-key
# OPENAI_MODEL=gpt-4o-mini

# Or Google Gemini
# GEMINI_API_KEY=your-gemini-key
```

### Features

- **Live Speech Autotyping:** Speak naturally into your microphone and watch ULTRON autotype your words directly into the interactive command bar in real time, accompanied by live holographic equalizer visualizers, glowing autotype indicators, and blinking telemetry cursors.
- **Automatic Voice Response:** As soon as you pause speaking (natural silence detection), ULTRON automatically finalizes your query, transmits the directive, and replies aloud with high-fidelity audible neural speech (TTS) while autotyping his response across the HUD banner in sync with his voice.
- **Hands-Free Conversational Loop:** Once ULTRON completes his voice response, the microphone automatically re-arms after an echo-suppression buffer, allowing a completely continuous, hands-free conversational loop.
- **Manual Stop & Immediate Voice Reply:** Finalize your speech at any moment via the interactive `[⏹️ SEND NOW]` button or keyboard shortcuts (`V`, `Space`, `Enter`) to trigger an immediate voice response without waiting for silence detection.
- **Interrupt Assistant & Reply by Voice:** Instantly silence ULTRON during speech playback using `[⏹️ STOP ULTRON & REPLY BY VOICE]` or pressing `ESC` / `Space`, which immediately re-opens the microphone so you can reply using your voice.
- **Dedicated Voice Input Button:** Quick `🎙️ VOICE INPUT` toggle right in the bottom command bar to easily switch between voice directives and keyboard input.
- **Live Subtitles & Dialogue Typewriter:** Real-time HUD banner displays transcripts of what you said and autotypes ULTRON's response in sync with his speech.
- **Audible Text-to-Speech (TTS):** ULTRON speaks every response aloud with high-fidelity neural speech. Powered by a Web Audio API decoding pipeline that permanently unlocks browser audio and prevents autoplay blocking.
- **Voice Persona Selector:** Choose between **JARVIS** (British articulate tech AI), **ULTRON** (Deep resonant cyborg harmonics), **FRIDAY** (Clear natural AI assistant), or **NATIVE** (Device browser synthesis).
- **Audio & Mic Toggles & Test Button:** Independent `🎙️ MIC`, `🔊 TTS`, `🔊 TEST VOICE`, and Voice Persona controls allow immediate voice testing and seamless switching between voice and silent typing modes.
- **Audio-Reactive 3D Orb:** The holographic core surges, spins, and blooms in sync with the assistant's speech and thinking states.
- **Telemetry History Log:** View recent conversation exchanges directly from the HUD.
- **Multi-Provider & Offline Fallback:** Seamlessly routes between Claude, GPT, Gemini, or ULTRON's built-in offline response engine if no keys are provided or network errors occur.


