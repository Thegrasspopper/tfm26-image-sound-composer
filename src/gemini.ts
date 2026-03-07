import { GoogleGenAI } from "@google/genai";

export type EmotionResult = {
  valence: number;
  arousal: number;
  dominance: number;
  brightness: number;
  motion: number;
  palette: "warm" | "cool" | "neutral" | "mixed";
  texture: "soft" | "clean" | "rough" | "dense";
  sceneMood: string;
  positiveLocalStyles: string[];
  negativeLocalStyles: string[];
};

export type AnalyzeContext = {
  sectionName: string;
  sectionIndex: number;
  totalSections: number;
  selectedGenres: string[];
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

const GENRE_DETAILS: Record<string, string> = {
  electronic: "synth-driven textures, digital timbres, rhythmic pulse",
  ambient: "slow evolution, atmospheric pads, minimal percussion",
  orchestral: "strings, brass, cinematic dynamics, broad harmonic movement",
  cinematic: "dramatic buildup, emotional arcs, soundtrack-like structure",
  "lo-fi": "dusty texture, soft transients, relaxed groove",
  house: "steady four-on-the-floor beat, dance groove, repetitive motifs",
  techno: "mechanical pulse, hypnotic repetition, dark synthetic textures",
  trap: "808 bass, sharp hats, punchy syncopation",
  rock: "guitars, live drums, energetic dynamics",
  jazz: "extended harmony, swing or syncopation, expressive instrumentation",
  pop: "clear hooks, polished production, accessible melody",
  "hip-hop": "groove-focused beats, bass-forward rhythm, vocal-centric space"
};

const responseSchema = {
  type: "object",
  properties: {
    valence: { type: "number", description: "Emotional positivity from -1 to 1" },
    arousal: { type: "number", description: "Energy/intensity from 0 to 1" },
    dominance: { type: "number", description: "Sense of power/control from 0 to 1" },
    brightness: { type: "number", description: "Perceived visual brightness from 0 to 1" },
    motion: { type: "number", description: "Perceived motion/dynamism from 0 to 1" },
    palette: { type: "string", enum: ["warm", "cool", "neutral", "mixed"] },
    texture: { type: "string", enum: ["soft", "clean", "rough", "dense"] },
    sceneMood: { type: "string", description: "Short mood label" },
    positiveLocalStyles: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 6
    },
    negativeLocalStyles: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 4
    }
  },
  required: [
    "valence",
    "arousal",
    "dominance",
    "brightness",
    "motion",
    "palette",
    "texture",
    "sceneMood",
    "positiveLocalStyles",
    "negativeLocalStyles"
  ],
  additionalProperties: false
};

export const analyzeImageEmotion = async (
  base64Image: string,
  mimeType: string = "image/jpeg",
  context?: AnalyzeContext
): Promise<EmotionResult> => {
  if (!GEMINI_API_KEY) {
    throw new Error("Missing Gemini API key");
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const selectedGenreDetails = (context?.selectedGenres ?? [])
    .map((genre) => `- ${genre}: ${GENRE_DETAILS[genre] ?? "user selected style reference"}`)
    .join("\n");

  const sectionContextLine = context
    ? `Song section context: "${context.sectionName}" (${context.sectionIndex}/${context.totalSections}).`
    : "Song section context: not provided.";

  const prompt = `Analyze this image using the Valence-Arousal-Dominance model.
Return only valid JSON that matches the schema.
Infer emotional/perceptual values and propose musical style directives.
${sectionContextLine}
Selected genres and style details:
${selectedGenreDetails || "- none provided"}
Provide:
- positiveLocalStyles: musical traits to emphasize in this section
- negativeLocalStyles: musical traits to avoid in this section`;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: {
      parts: [{ inlineData: { mimeType, data: base64Image } }, { text: prompt }]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema
    }
  });

  const text = response.text;
  if (!text) {
    throw new Error("Empty response from AI");
  }

  try {
    return JSON.parse(text) as EmotionResult;
  } catch {
    throw new Error("Gemini analysis failed. Please try another image.");
  }
};
