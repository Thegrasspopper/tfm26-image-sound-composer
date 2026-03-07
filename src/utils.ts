export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function splitDataUrl(dataUrl: string): { mimeType: string; base64Data: string } {
  const [header, base64Data] = dataUrl.split(",");
  const mimeTypeMatch = header.match(/data:(.*?);base64/);
  return {
    mimeType: mimeTypeMatch?.[1] ?? "image/jpeg",
    base64Data
  };
}

export type MusicSection = {
  sectionName: string;
  positiveLocalStyles: string[];
  negativeLocalStyles: string[];
  durationMs: number;
  lines: string[];
};

export type ElevenLabsMusicPrompt = {
  positiveGlobalStyles: string[];
  negativeGlobalStyles: string[];
  sections: MusicSection[];
};

type PromptImage = {
  name: string;
  emotion: string;
  prompt: string;
  durationSec?: number;
  positiveLocalStyles?: string[];
  negativeLocalStyles?: string[];
};

function normalizeLabel(value: string): string {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitStyles(text: string): string[] {
  return text
    .split(/[,;|\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitPromptPolarity(text: string): { positive: string[]; negative: string[] } {
  const tokens = splitStyles(text);
  const positive: string[] = [];
  const negative: string[] = [];

  for (const token of tokens) {
    const lowered = token.toLowerCase();
    if (token.startsWith("-") || token.startsWith("!") || lowered.startsWith("no ")) {
      const cleaned = token.replace(/^[-!]\s*/, "").replace(/^no\s+/i, "").trim();
      if (cleaned) {
        negative.push(cleaned);
      }
      continue;
    }
    positive.push(token);
  }

  return { positive, negative };
}

type BuildOptions = {
  positiveGlobalStyles?: string[];
  negativeGlobalStyles?: string[];
  generalPrompt?: string;
  totalDurationMs?: number;
};

function computeSectionDurations(sectionCount: number, totalDurationMs: number): number[] {
  if (sectionCount <= 0) {
    return [];
  }

  const safeTotal = Math.max(totalDurationMs, sectionCount * 1000);
  if (sectionCount === 1) {
    return [safeTotal];
  }

  if (sectionCount === 2) {
    const intro = Math.floor(safeTotal / 2);
    return [intro, safeTotal - intro];
  }

  const intro = Math.floor(safeTotal * 0.1);
  const finalBurst = Math.floor(safeTotal * 0.1);
  const middleCount = sectionCount - 2;
  const middleTotal = safeTotal - intro - finalBurst;
  const middleBase = Math.floor(middleTotal / middleCount);
  let remainder = middleTotal - middleBase * middleCount;

  const middleDurations = Array.from({ length: middleCount }, () => {
    const extra = remainder > 0 ? 1 : 0;
    remainder = Math.max(remainder - 1, 0);
    return middleBase + extra;
  });

  return [intro, ...middleDurations, finalBurst];
}

export function buildMusicPromptFromImages(images: PromptImage[], options?: BuildOptions): ElevenLabsMusicPrompt {
  const durations = computeSectionDurations(images.length, options?.totalDurationMs ?? 60_000);
  const sections = images.map((item, index) => {
    const isFirst = index === 0;
    const isLast = index === images.length - 1;
    const emotion = item.emotion.trim();
    const promptStyles = splitPromptPolarity(item.prompt);
    const positiveLocalStyles = Array.from(
      new Set([emotion, ...(item.positiveLocalStyles ?? []), ...promptStyles.positive].filter(Boolean))
    );
    const negativeLocalStyles = Array.from(new Set([...(item.negativeLocalStyles ?? []), ...promptStyles.negative]));
    const sectionName = isFirst
      ? "Intro"
      : isLast
        ? "Final burst"
        : `Section ${index + 1} - ${normalizeLabel(item.name) || `Image ${index + 1}`}`;

    const manualDurationMs =
      typeof item.durationSec === "number" && Number.isFinite(item.durationSec) && item.durationSec > 0
        ? Math.round(item.durationSec * 1000)
        : undefined;

    return {
      sectionName,
      positiveLocalStyles: positiveLocalStyles.length ? positiveLocalStyles : ["cinematic", "dynamic"],
      negativeLocalStyles,
      durationMs: manualDurationMs ?? durations[index] ?? 4000,
      lines: []
    };
  });

  const positiveGlobalStyles = Array.from(
    new Set(images.map((item) => item.emotion.trim()).filter((emotion) => emotion && emotion !== "Analyzing..."))
  );

  const selectedGlobalStyles = (options?.positiveGlobalStyles ?? []).map((style) => style.trim()).filter(Boolean);
  const selectedNegativeGlobalStyles = (options?.negativeGlobalStyles ?? [])
    .map((style) => style.trim())
    .filter(Boolean);
  const generalPromptStyles = splitStyles(options?.generalPrompt ?? "");
  const mergedGlobalStyles = Array.from(new Set([...selectedGlobalStyles, ...generalPromptStyles]));

  return {
    positiveGlobalStyles: mergedGlobalStyles.length
      ? mergedGlobalStyles
      : positiveGlobalStyles.length
        ? positiveGlobalStyles
        : ["cinematic", "expressive"],
    negativeGlobalStyles: Array.from(new Set(selectedNegativeGlobalStyles)),
    sections
  };
}
