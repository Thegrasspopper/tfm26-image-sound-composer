import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { ElevenLabsMusicPrompt } from "./utils";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

type ElevenLabsMusicOptions = {
  forceInstrumental?: boolean;
};

export async function sendPromptToElevenLabs(
  payload: ElevenLabsMusicPrompt,
  options?: ElevenLabsMusicOptions
): Promise<string> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error("Missing ElevenLabs API key");
  }

  const client = new ElevenLabsClient({
    apiKey: ELEVENLABS_API_KEY
  });

  const audioStream = await client.music.compose({
    forceInstrumental: options?.forceInstrumental ?? false,
    compositionPlan: payload
  });

  const blob = await new Response(audioStream).blob();
  return URL.createObjectURL(blob);
}

export function revokeAudioUrl(audioUrl: string): void {
  URL.revokeObjectURL(audioUrl);
}
