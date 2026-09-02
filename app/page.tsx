"use client";

import { useState } from "react";
import JarvisOrb from "@/components/JarvisOrb";
import VoiceBot, { type AgentState } from "@/components/VoiceBot";

export default function Home() {
  const [agentState, setAgentState] = useState<AgentState>("listening");

  return (
    <main>
      <JarvisOrb agentState={agentState} />
      <VoiceBot onAgentStateChange={setAgentState} />
    </main>
  );
}


