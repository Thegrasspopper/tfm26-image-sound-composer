const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;
const ELEVENLABS_MODEL = import.meta.env.VITE_ELEVENLABS_MODEL ?? "eleven_multilingual_v2";

export async function sendPromptToElevenLabs(prompt: string): Promise<string> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error("Missing ElevenLabs API key");
  }

  const response = await fetch("https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb", {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg"
    },
    body: JSON.stringify({
      text: prompt,
      model_id: ELEVENLABS_MODEL
    })
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs error ${response.status}`);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}