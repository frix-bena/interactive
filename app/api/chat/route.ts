import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY environment variable is not configured." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const rawMessages = body?.messages;

    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      return NextResponse.json(
        { error: "A non-empty 'messages' array is required." },
        { status: 400 }
      );
    }

    const formattedMessages: Anthropic.MessageParam[] = [];
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

    const mergedMessages: Anthropic.MessageParam[] = [];
    for (const msg of validMessages) {
      const prev = mergedMessages[mergedMessages.length - 1];
      if (prev && prev.role === msg.role) {
        prev.content = `${prev.content}\n${msg.content}`;
      } else {
        mergedMessages.push({ role: msg.role, content: msg.content });
      }
    }

    const anthropic = new Anthropic({
      apiKey,
    });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      system:
        "You're a friendly voice assistant having a casual spoken conversation about any topic the user brings up. Keep replies short (1-3 sentences) and conversational since they'll be spoken aloud via TTS — no markdown, no bullet points, no long paragraphs.",
      messages: mergedMessages,
    });

    let reply = "";
    for (const block of response.content) {
      if (block.type === "text") {
        reply += block.text;
      }
    }

    return NextResponse.json({ reply });
  } catch (error: unknown) {
    console.error("Error in /api/chat:", error);
    const message =
      error instanceof Error ? error.message : "Failed to process chat request.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
