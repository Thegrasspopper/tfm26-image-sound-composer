import Anthropic from "@anthropic-ai/sdk";
import type { AnalyzeContext, EmotionResult } from "./gemini";

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-haiku-4-5";
const ANALYSIS_TOOL_NAME = "return_image_analysis";

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

function buildPrompt(context?: AnalyzeContext): string {
  const selectedGenreDetails = (context?.selectedGenres ?? [])
    .map((genre) => `- ${genre}: ${GENRE_DETAILS[genre] ?? "user selected style reference"}`)
    .join("\n");

  const sectionContextLine = context
    ? `Song section context: "${context.sectionName}" (${context.sectionIndex}/${context.totalSections}).`
    : "Song section context: not provided.";

  return `Analyze this image using the Valence-Arousal-Dominance model.
Use the provided tool to return the structured result.
${sectionContextLine}
Selected genres and style details:
${selectedGenreDetails || "- none provided"}
Make sure the negative prompts don't conflict with the positive prompts,
No markdown. No explanation.`;
}

const ANALYSIS_TOOL_SCHEMA = {
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
      minItems: 1,
      maxItems: 2
    },
    negativeLocalStyles: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 2
    },
    sectionName : { type: "string", description: "Name of the song section (e.g. verse, chorus)" },
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
    "negativeLocalStyles",
    "sectionName"
  ],
  additionalProperties: false
} as const;

function isEmotionResult(value: unknown): value is EmotionResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const data = value as Record<string, unknown>;
  return (
    typeof data.valence === "number" &&
    typeof data.arousal === "number" &&
    typeof data.dominance === "number" &&
    typeof data.brightness === "number" &&
    typeof data.motion === "number" &&
    typeof data.palette === "string" &&
    typeof data.texture === "string" &&
    typeof data.sceneMood === "string" &&
    Array.isArray(data.positiveLocalStyles) &&
    Array.isArray(data.negativeLocalStyles) &&
    typeof data.sectionName === "string"
  );
}

export async function analyzeImageEmotionWithClaude(
  base64Image: string,
  mimeType: string = "image/jpeg",
  context?: AnalyzeContext
): Promise<EmotionResult> {
  if (!CLAUDE_API_KEY) {
    throw new Error("Missing Claude API key");
  }

  const anthropic = new Anthropic({
    apiKey: CLAUDE_API_KEY,
    dangerouslyAllowBrowser: true
  });

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 800,
    temperature: 0.2,
    tools: [
      {
        name: ANALYSIS_TOOL_NAME,
        description: "Return structured image-to-music analysis.",
        input_schema: ANALYSIS_TOOL_SCHEMA
      }
    ],
    tool_choice: {
      type: "tool",
      name: ANALYSIS_TOOL_NAME
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: base64Image
            }
          },
          {
            type: "text",
            text: buildPrompt(context)
          }
        ]
      }
    ]
  });

  const toolUse = message.content.find(
    (part) => part.type === "tool_use" && part.name === ANALYSIS_TOOL_NAME
  );
  if (!toolUse || !isEmotionResult(toolUse.input)) {
    throw new Error("Claude analysis failed. Tool output missing or invalid.");
  }

  return toolUse.input;
}
