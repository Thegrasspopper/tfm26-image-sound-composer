import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { ElevenLabsMusicPrompt } from "./utils";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

type ElevenLabsMusicOptions = {
  forceInstrumental?: boolean;
};

export async function sendPromptToElevenLabs(
  payload: ElevenLabsMusicPrompt,
  options?: ElevenLabsMusicOptions,
  apiKey?: string
): Promise<string> {
  const key = apiKey || ELEVENLABS_API_KEY;
  if (!key) {
    throw new Error("Missing ElevenLabs API key");
  }

  const client = new ElevenLabsClient({
    apiKey: key
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

export type ElevenLabsBalance = {
  used: number;
  limit: number;
  remaining: number;
};

export async function getElevenLabsCharacterBalance(apiKey?: string): Promise<ElevenLabsBalance> {
  const key = apiKey || ELEVENLABS_API_KEY;
  if (!key) {
    throw new Error("Missing ElevenLabs API key");
  }

  const client = new ElevenLabsClient({
    apiKey: key
  });

  const subscription = await client.user.subscription.get();
  const used = subscription.characterCount ?? 0;
  const limit = subscription.characterLimit ?? 0;
  const remaining = Math.max(limit - used, 0);

  return { used, limit, remaining };
}
