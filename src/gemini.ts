export type EmotionResult = {
  emotion: string;
  reason?: string;
};

const GEMINI_API_KEY = import.meta.env.GEMINI_API_KEY;
const GEMINI_MODEL = import.meta.env.GEMINI_MODEL ?? "gemini-1.5-flash";

const DEFAULT_ANALYZE_PROMPT =
  "Analyze this image and return the main emotion it evokes in one short label. Reply using JSON only: {\"emotion\":\"...\",\"reason\":\"...\"}";

function parseEmotionResponse(text: string): EmotionResult {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as EmotionResult;
    if (!parsed.emotion || typeof parsed.emotion !== "string") {
      throw new Error("Missing emotion field in Gemini response");
    }
    return parsed;
  } catch {
    return { emotion: cleaned.slice(0, 40) || "Unknown" };
  }
}

export async function analyzeImageEmotion(base64Data: string, mimeType: string): Promise<EmotionResult> {
  if (!GEMINI_API_KEY) {
    return { emotion: "No API key" };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: DEFAULT_ANALYZE_PROMPT },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data
                }
              }
            ]
          }
        ]
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini error ${response.status}`);
  }

  const data = await response.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return { emotion: "Unknown" };
  }

  return parseEmotionResponse(text);
}