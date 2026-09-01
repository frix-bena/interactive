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

## Voice bot

The application includes an integrated real-time voice chat bot powered by Anthropic's Claude (`claude-sonnet-4-6`).

### Setup

To use the voice assistant, you must supply your own Anthropic API key. Create a `.env.local` file in the project root:

```bash
cp .env.local.example .env.local
```

Then edit `.env.local` and add your valid Anthropic API key:

```env
ANTHROPIC_API_KEY=your-actual-api-key
```

> **Note:** You must supply your own Anthropic API key in `.env.local` for the voice assistant to generate responses.

### How it works

- **Speech Recognition:** Automatically listens via the browser's native Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`).
- **AI Processing:** Spoken utterances are sent to `/api/chat`, which queries Anthropic's `claude-sonnet-4-6` model with running conversation history.
- **Text-to-Speech:** The bot speaks replies aloud using browser `window.speechSynthesis`.
- **Hands-Free Continuous Conversation:** Listening pauses automatically while the bot speaks (so it does not hear itself) and resumes once speech finishes.
- **Autoplay Handling:** Attempts auto-start immediately upon mount; if the browser restricts microphone access without user interaction, a "Tap to start talking" prompt allows one-click activation.

