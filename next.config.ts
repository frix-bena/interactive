import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  env: {
    NEXT_PUBLIC_GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "",
    NEXT_PUBLIC_GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-3.8-live",
    NEXT_PUBLIC_GEMINI_VOICE: process.env.GEMINI_VOICE || "Puck",
  },
};

export default nextConfig;

