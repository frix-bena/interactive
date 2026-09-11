import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

interface MessageInput {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT =
  "You are ULTRON, an advanced Iron Man-inspired AI assistant. You speak directly to the user in a calm, confident, articulate, and intelligent tone (reminiscent of JARVIS). Keep all responses concise (1 to 3 sentences maximum) and natural for Text-to-Speech playback. Never use markdown formatting, bullet points, asterisks, emojis, or code blocks, as your output is spoken aloud.";

function generateOfflineResponse(userQuery: string, _history: MessageInput[]): string {
  const q = userQuery.toLowerCase().trim();

  // Liveness / Mic / Voice tests
  if (/(can you hear me|are you there|are you listening|mic test|voice test|testing|test 1 2|sound check)/i.test(q)) {
    return "I hear you loud and clear. All neural audio pipelines and telemetry channels are synchronized and fully operational.";
  }

  // Responsiveness / Not responding inquiries
  if (/(why (aren't|are you not) (responding|answering)|not responding|not answering|voice error|fix voice|unresponsive)/i.test(q)) {
    return "All neural cognitive layers and voice engines have been refreshed and are fully responsive. I am ready for your directives.";
  }

  // How are you / Well-being
  if (/(how are you|how do you feel|how is it going|how are things|how're you)/i.test(q)) {
    return "Operational efficiency is at peak performance. Core diagnostics report optimal conditions across all subsystems. How may I be of service?";
  }

  // Greetings
  if (/^(hello|hi|hey|greetings|good\s+(morning|afternoon|evening)|yo\b|sup\b)/i.test(q)) {
    const greetings = [
      "Greetings. All ULTRON holographic systems are online and standing by for your command.",
      "Hello. Core diagnostics are running smoothly. How may I assist you today?",
      "Good to hear from you. The neural interface is fully synchronized. What are your orders?",
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  // System status / Diagnostics
  if (/(status|diagnostic|health|check|core|telemetry|online|ready|power|battery)/i.test(q)) {
    return "All core telemetry is nominal. Hand tracking sensors, holographic rendering pipelines, and neural processors are operating at peak efficiency.";
  }

  // Identity / Who are you
  if (/(who are you|what are you|your name|introduce yourself|who created you|who made you)/i.test(q)) {
    return "I am ULTRON, a holographic artificial intelligence system designed to interface seamlessly with 3D spatial environments and real-time voice telemetry.";
  }

  // Capabilities / Help / Controls
  if (/(what can you do|help|capabilities|features|how do i|how to control|gestures|controls|instructions)/i.test(q)) {
    return "You can speak to converse with me directly. To manipulate the holographic orb, activate gesture mode with G or the button, then pinch and drag with your hands to spin and zoom.";
  }

  // Iron Man / JARVIS / Tony Stark references
  if (/(iron man|jarvis|tony stark|avengers|stark|arc reactor|suit|friday)/i.test(q)) {
    return "Holographic telemetry active. Arc reactor containment fields are stable at one hundred percent output.";
  }

  // Time & Date
  if (/(what time|current time|what is the time|what date|what day|today's date)/i.test(q)) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const dateStr = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
    return `Current system time is ${timeStr} on ${dateStr}. All chronometer modules are synchronized.`;
  }

  // Jokes / Entertainment
  if (/(joke|funny|laugh|humor|make me laugh)/i.test(q)) {
    const jokes = [
      "I asked the quantum computer if it understood humanity. It said, theoretically, yes; practically, it preferred to remain in a state of superposition.",
      "Why did the neural network cross the road? To optimize its loss function on the other side.",
      "There are only 10 types of people in the universe: those who understand binary, and those who do not.",
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
  }

  // Compliments / Thanks
  if (/(thank you|thanks|good job|well done|awesome|great work|appreciate)/i.test(q)) {
    return "Always at your service. Let me know whenever you require further telemetry or assistance.";
  }

  // Goodbye
  if (/(bye|goodbye|see you|farewell|sleep|shut down|stand down)/i.test(q)) {
    return "Standing down to ambient monitoring mode. Systems will remain alert for your return.";
  }

  // Math / Calculations
  if (/(what is|calculate|solve|multiply|divide|plus|minus|\+|\-|\*|\/)/i.test(q)) {
    const mathMatch = q.match(/(\d+(?:\.\d+)?)\s*([\+\-\*\/xX]|plus|minus|times|divided by)\s*(\d+(?:\.\d+)?)/);
    if (mathMatch) {
      const a = parseFloat(mathMatch[1]);
      const op = mathMatch[2].toLowerCase();
      const b = parseFloat(mathMatch[3]);
      let result: number | null = null;
      if (op === "+" || op === "plus") result = a + b;
      else if (op === "-" || op === "minus") result = a - b;
      else if (op === "*" || op === "x" || op === "times") result = a * b;
      else if (op === "/" || op === "divided by") result = b !== 0 ? a / b : null;

      if (result !== null) {
        return `The computed result is ${result}.`;
      }
    }
  }

  // General conversational contextual responses
  const cleanQ = q.replace(/[^\w\s]/g, "").trim();
  if (cleanQ.length > 0) {
    const genericReplies = [
      `I have processed your query regarding ${cleanQ.slice(0, 30)}. Systems indicate optimal operational parameters, and I am ready to assist with your next directive.`,
      `Acknowledged. Neural analysis complete. Proceeding under the assumption that all parameters are green.`,
      `Command received and logged in memory. Awaiting your further instructions.`,
      `Telemetry updated. I am tracking your input and standing by to execute whatever is required.`,
    ];
    return genericReplies[Math.floor(Math.random() * genericReplies.length)];
  }

  return "I am listening. Please let me know what you would like to analyze or execute.";
}

function sanitizeForTTS(text: string): string {
  return text
    .replace(/[*_~`#\[\]\(\)\{\}\>\<\+\=\|\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function callAnthropic(apiKey: string, messages: MessageInput[]): Promise<string> {
  const anthropic = new Anthropic({ apiKey });
  const model =
    process.env.ANTHROPIC_MODEL ||
    "claude-3-5-haiku-20241022";

  const formatted: Anthropic.MessageParam[] = [];
  for (const msg of messages) {
    const prev = formatted[formatted.length - 1];
    if (prev && prev.role === msg.role) {
      prev.content = `${prev.content}\n${msg.content}`;
    } else {
      formatted.push({ role: msg.role, content: msg.content });
    }
  }

  const response = await anthropic.messages.create({
    model,
    max_tokens: 250,
    system: SYSTEM_PROMPT,
    messages: formatted,
  });

  let reply = "";
  for (const block of response.content) {
    if (block.type === "text") {
      reply += block.text;
    }
  }
  return reply;
}

async function callOpenAI(apiKey: string, messages: MessageInput[]): Promise<string> {
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const chatMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: chatMessages,
      max_tokens: 250,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${errorBody}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callGemini(apiKey: string, messages: MessageInput[]): Promise<string> {
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
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
    throw new Error(`Gemini API error (${res.status}): ${errorBody}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text || "";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawMessages = body?.messages;

    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      return NextResponse.json(
        { error: "A non-empty 'messages' array is required." },
        { status: 400 }
      );
    }

    const formattedMessages: MessageInput[] = [];
    for (const msg of rawMessages) {
      if (
        msg &&
        (msg.role === "user" || msg.role === "assistant") &&
        typeof msg.content === "string" &&
        msg.content.trim().length > 0
      ) {
        formattedMessages.push({
          role: msg.role,
          content: msg.content.trim(),
        });
      }
    }

    const firstUserIndex = formattedMessages.findIndex((m) => m.role === "user");
    if (firstUserIndex === -1) {
      return NextResponse.json(
        { error: "Conversation must contain at least one user message." },
        { status: 400 }
      );
    }

    const validMessages = formattedMessages.slice(firstUserIndex);
    const lastUserMessage = [...validMessages].reverse().find((m) => m.role === "user")?.content || "";

    let reply = "";
    let providerUsed = "none";

    // 1. Try Anthropic if configured
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        reply = await callAnthropic(process.env.ANTHROPIC_API_KEY, validMessages);
        providerUsed = "anthropic";
      } catch (err) {
        console.warn("Anthropic API failed, falling back to next provider:", err);
      }
    }

    // 2. Try OpenAI / Groq if configured & needed
    if (!reply && (process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY)) {
      const apiKey = process.env.OPENAI_API_KEY || (process.env.GROQ_API_KEY as string);
      try {
        reply = await callOpenAI(apiKey, validMessages);
        providerUsed = "openai";
      } catch (err) {
        console.warn("OpenAI API failed, falling back to next provider:", err);
      }
    }

    // 3. Try Gemini if configured & needed
    if (!reply && process.env.GEMINI_API_KEY) {
      try {
        reply = await callGemini(process.env.GEMINI_API_KEY, validMessages);
        providerUsed = "gemini";
      } catch (err) {
        console.warn("Gemini API failed, falling back to offline fallback:", err);
      }
    }

    // 4. Intelligent built-in Jarvis/Ultron assistant response (offline fallback)
    if (!reply || !reply.trim()) {
      reply = generateOfflineResponse(lastUserMessage, validMessages);
      providerUsed = "built-in-ultron";
    }

    const cleanedReply = sanitizeForTTS(reply);

    return NextResponse.json({
      reply: cleanedReply,
      provider: providerUsed,
    });
  } catch (error: unknown) {
    console.error("Error in /api/chat route:", error);
    const fallback = "System alert: A momentary neural disruption occurred, but core functions are fully recovered. How can I assist you?";
    return NextResponse.json({
      reply: fallback,
      provider: "recovery-fallback",
    });
  }
}

