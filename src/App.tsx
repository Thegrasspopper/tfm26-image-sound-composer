import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeImageEmotionWithClaude } from "./claude";
import CustomAudioPlayer from "./CustomAudioPlayer";
import { revokeAudioUrl, sendPromptToElevenLabs } from "./elevenlabs";
import { analyzeImageEmotion, type EmotionResult } from "./gemini";
import { buildMusicPromptFromImages, fileToDataUrl, splitDataUrl } from "./utils";

type AIProvider = "gemini" | "claude";

type ImageItem = {
  id: string;
  src: string;
  name: string;
  emotion: string;
  prompt: string;
  durationSec?: number;
  positiveLocalStyles: string[];
  negativeLocalStyles: string[];
  analyzing: boolean;
  valence?: number;
  arousal?: number;
  dominance?: number;
  brightness?: number;
  motion?: number;
  palette?: string;
  texture?: string;
  sectionName?: string;
};

type AnalysisContext = {
  sectionName: string;
  sectionIndex: number;
  totalSections: number;
  selectedGenres: string[];
};

type ExportFile = {
  version: 1;
  exportedAt: string;
  aiProvider: AIProvider;
  totalDurationSec: number;
  generalPrompt: string;
  selectedGenres: string[];
  selectedNegativePrompts: string[];
  customPositivePrompts: string[];
  customNegativePrompts: string[];
  forceInstrumental: boolean;
  audioUrl?: string;
  items: Array<{
    id: string;
    src: string;
    name: string;
    emotion: string;
    prompt: string;
    durationSec?: number;
    positiveLocalStyles: string[];
    negativeLocalStyles: string[];
    valence?: number;
    arousal?: number;
    dominance?: number;
    brightness?: number;
    motion?: number;
    palette?: string;
    texture?: string;
    sectionName?: string;
  }>;
};

const DEFAULT_PROMPT = "Unknown";
const GENRE_OPTIONS = [
  "electronic",
  "ambient",
  "orchestral",
  "cinematic",
  "lo-fi",
  "house",
  "techno",
  "trap",
  "rock",
  "jazz",
  "pop",
  "hip-hop"
];
const NEGATIVE_PROMPT_OPTIONS = [
  "comercial",
  "stock",
  "folk",
  "celtic",
  "corporate",
  "uplifting",
  "ukulele",
  "advertising",
  "jingle",
  "singer-songwriter"
];
const DEFAULT_IMAGE_DURATION_SEC = 10;

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default function App() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverSequence, setDragOverSequence] = useState<boolean>(false);
  const [durationEditingId, setDurationEditingId] = useState<string | null>(null);
  const [labelEditingId, setLabelEditingId] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState<AIProvider>("claude");
  const [selectedGenres, setSelectedGenres] = useState<string[]>(["cinematic"]);
  const [selectedNegativePrompts, setSelectedNegativePrompts] = useState<string[]>([
    "comercial",
    "stock",
    "folk",
    "celtic",
    "corporate"
  ]);
  const [customPositivePrompts, setCustomPositivePrompts] = useState<string[]>([]);
  const [customNegativePrompts, setCustomNegativePrompts] = useState<string[]>([]);
  const [newPositivePrompt, setNewPositivePrompt] = useState<string>("");
  const [newNegativePrompt, setNewNegativePrompt] = useState<string>("");
  const [newLocalPositivePrompt, setNewLocalPositivePrompt] = useState<string>("");
  const [newLocalNegativePrompt, setNewLocalNegativePrompt] = useState<string>("");
  const [totalDurationSec, setTotalDurationSec] = useState<number>(120);
  const [generalPrompt, setGeneralPrompt] = useState<string>("");
  const [forceInstrumental, setForceInstrumental] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [showApiKeysModal, setShowApiKeysModal] = useState<boolean>(false);
  const [claudeApiKey, setClaudeApiKey] = useState<string>(() => localStorage.getItem("user_claude_api_key") ?? "");
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState<string>(() => localStorage.getItem("user_elevenlabs_api_key") ?? "");
  const [draftClaudeKey, setDraftClaudeKey] = useState<string>("");
  const [draftElevenLabsKey, setDraftElevenLabsKey] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const sequenceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (audioUrl) {
        revokeAudioUrl(audioUrl);
      }
    };
  }, [audioUrl]);

  useEffect(() => {
    const totalFromTracks = items.reduce((sum, item) => sum + (item.durationSec ?? 0), 0);
    setTotalDurationSec((prev) => (prev === totalFromTracks ? prev : totalFromTracks));
  }, [items]);

  const selectedItem = items.find((item) => item.id === selectedId) ?? null;

  const musicPrompt = useMemo(() => {
    return buildMusicPromptFromImages(
      items.map((item) => ({
        name: item.name,
        emotion: item.emotion,
        prompt: item.prompt,
        durationSec: item.durationSec,
        positiveLocalStyles: item.positiveLocalStyles,
        negativeLocalStyles: item.negativeLocalStyles
      })),
      {
        positiveGlobalStyles: [...selectedGenres, ...customPositivePrompts],
        negativeGlobalStyles: [...selectedNegativePrompts, ...customNegativePrompts],
        generalPrompt,
        totalDurationMs: totalDurationSec * 1000
      }
    );
  }, [
    items,
    selectedGenres,
    selectedNegativePrompts,
    customPositivePrompts,
    customNegativePrompts,
    generalPrompt,
    totalDurationSec
  ]);

  const selectedSection = useMemo(() => {
    if (!selectedId) {
      return null;
    }
    const selectedIndex = items.findIndex((item) => item.id === selectedId);
    if (selectedIndex < 0) {
      return null;
    }
    return musicPrompt.sections[selectedIndex] ?? null;
  }, [items, selectedId, musicPrompt.sections]);

  async function analyzeImageWithProvider(
    base64Data: string,
    mimeType: string,
    context: AnalysisContext
  ): Promise<EmotionResult> {
    if (aiProvider === "claude") {
      return analyzeImageEmotionWithClaude(base64Data, mimeType, context, claudeApiKey || undefined);
    }
    return analyzeImageEmotion(base64Data, mimeType, context);
  }

  function countMatches(source: string[], target: string[]): number {
    const targetSet = new Set(target.map((value) => value.toLowerCase()));
    return source.filter((value) => targetSet.has(value.toLowerCase())).length;
  }

  function buildDifferentiators(result: EmotionResult, previous: ImageItem): string[] {
    const suggestions = [
      `${result.palette} tonal palette`,
      `${result.texture} texture focus`,
      result.arousal >= 0.65 ? "high-energy accents" : "spacious low-energy phrasing",
      result.motion >= 0.6 ? "forward rhythmic motion" : "gentle static pacing",
      result.valence >= 0 ? "brighter harmonic color" : "darker harmonic color",
      result.dominance >= 0.6 ? "assertive lead presence" : "softer supporting layers"
    ];

    const previousSet = new Set(
      [...previous.positiveLocalStyles, ...previous.negativeLocalStyles].map((value) => value.toLowerCase())
    );

    return suggestions.filter((candidate) => !previousSet.has(candidate.toLowerCase()));
  }

  function applySimilarityDiversification(
    result: EmotionResult,
    previous: ImageItem | undefined
  ): { prompt: string; positiveLocalStyles: string[]; negativeLocalStyles: string[] } {
    const mood = result.sceneMood?.trim() || "Unknown";
    const positiveLocalStyles = [...(result.positiveLocalStyles ?? [])];
    const negativeLocalStyles = [...(result.negativeLocalStyles ?? [])];

    if (!previous) {
      return { prompt: mood, positiveLocalStyles, negativeLocalStyles };
    }

    const positiveMatches = countMatches(positiveLocalStyles, previous.positiveLocalStyles);
    const negativeMatches = countMatches(negativeLocalStyles, previous.negativeLocalStyles);
    const totalMatches = positiveMatches + negativeMatches;

    if (totalMatches > 2) {
      const addCount = totalMatches >= 5 ? 2 : 1;
      const extra = buildDifferentiators(result, previous).slice(0, addCount);
      for (const style of extra) {
        if (!positiveLocalStyles.some((value) => value.toLowerCase() === style.toLowerCase())) {
          positiveLocalStyles.push(style);
        }
      }
      return {
        prompt: extra.length ? `${mood}, ${extra.join(", ")}` : mood,
        positiveLocalStyles,
        negativeLocalStyles
      };
    }

    return { prompt: mood, positiveLocalStyles, negativeLocalStyles };
  }

  async function onFilesPicked(fileList: FileList | File[] | null) {
    if (!fileList?.length) {
      return;
    }
    setStatus("Loading iamge(s)...");

    const files = Array.from(fileList);
    const newItems: ImageItem[] = [];

    for (const file of files) {
      const src = await fileToDataUrl(file);
      newItems.push({
        id: `${file.name}-${generateId()}`,
        src,
        name: file.name,
        emotion: "Analyzing...",
        prompt: DEFAULT_PROMPT,
        durationSec: DEFAULT_IMAGE_DURATION_SEC,
        positiveLocalStyles: [],
        negativeLocalStyles: [],
        analyzing: true
      });
    }

    setItems((prev) => [...prev, ...newItems]);
    if (!selectedId && newItems[0]) {
      setSelectedId(newItems[0].id);
    }

    const totalAfterUpload = items.length + newItems.length;

    const workingItems = [...items, ...newItems];

    for (const [offset, item] of newItems.entries()) {
      try {
        const { base64Data, mimeType } = splitDataUrl(item.src);
        const sectionIndex = items.length + offset + 1;
        const sectionName = getSectionName(sectionIndex, totalAfterUpload);
        setStatus("Sending to analyse...");

        const result = await analyzeImageWithProvider(base64Data, mimeType, {
          sectionName,
          sectionIndex,
          totalSections: totalAfterUpload,
          selectedGenres
        });
        const previousItem = workingItems[items.length + offset - 1];
        const diversified = applySimilarityDiversification(result, previousItem);
        const mood = result.sceneMood?.trim() || "Unknown";
        setStatus("Image analysed");
        workingItems[items.length + offset] = {
          ...workingItems[items.length + offset],
          emotion: mood,
          positiveLocalStyles: diversified.positiveLocalStyles,
          negativeLocalStyles: diversified.negativeLocalStyles,
          prompt: diversified.prompt,
          analyzing: false,
          valence: result.valence,
          arousal: result.arousal,
          dominance: result.dominance,
          brightness: result.brightness,
          motion: result.motion,
          palette: result.palette,
          texture: result.texture,
          sectionName
        };

        setItems((prev) =>
          prev.map((current) =>
            current.id === item.id
              ? {
                ...current,
                emotion: mood,
                positiveLocalStyles: diversified.positiveLocalStyles,
                negativeLocalStyles: diversified.negativeLocalStyles,
                prompt: diversified.prompt,
                analyzing: false,
                valence: result.valence,
                arousal: result.arousal,
                dominance: result.dominance,
                brightness: result.brightness,
                motion: result.motion,
                palette: result.palette,
                texture: result.texture,
                sectionName
              }
              : current
          )
        );
      } catch (error) {
        setItems((prev) =>
          prev.map((current) =>
            current.id === item.id
              ? {
                ...current,
                emotion: "Analysis failed",
                analyzing: false
              }
              : current
          )
        );
        setStatus(error instanceof Error ? error.message : "Gemini analysis failed");
      }
    }
    setStatus("Done");

  }

  function onPromptChange(value: string) {
    if (!selectedId) {
      return;
    }

    setItems((prev) =>
      prev.map((item) =>
        item.id === selectedId
          ? {
            ...item,
            emotion: value,
            prompt: value
          }
          : item
      )
    );
  }

  function onDurationChange(value: string) {
    if (!selectedId) {
      return;
    }

    const trimmed = value.trim();
    const parsed = Number(trimmed);
    const durationSec = trimmed === "" || !Number.isFinite(parsed) || parsed <= 0 ? undefined : Math.round(parsed);

    setItems((prev) => {
      const next = prev.map((item) =>
        item.id === selectedId
          ? {
            ...item,
            durationSec
          }
          : item
      );

      return next;
    });
  }

  function onItemDurationChange(itemId: string, value: string) {
    const trimmed = value.trim();
    const parsed = Number(trimmed);
    const durationSec = trimmed === "" || !Number.isFinite(parsed) || parsed <= 0 ? undefined : Math.round(parsed);

    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
            ...item,
            durationSec
          }
          : item
      )
    );
  }

  function stopDurationEditing() {
    setDurationEditingId(null);
  }

  function onItemLabelChange(itemId: string, value: string) {
    setItems((prev) =>
      prev.map((item) => item.id === itemId ? { ...item, emotion: value } : item)
    );
  }

  function scrollSequence(direction: "left" | "right") {
    if (!sequenceRef.current) return;
    const scrollAmount = 334; // card width (320) + gap (14)
    sequenceRef.current.scrollBy({ left: direction === "left" ? -scrollAmount : scrollAmount, behavior: "smooth" });
  }

  function moveItem(sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      return;
    }

    setItems((prev) => {
      const sourceIndex = prev.findIndex((item) => item.id === sourceId);
      const targetIndex = prev.findIndex((item) => item.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) {
        return prev;
      }

      const next = [...prev];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  function removeImage(itemId: string) {
    setItems((prev) => {
      const next = prev.filter((item) => item.id !== itemId);
      setSelectedId((currentSelectedId) => {
        if (currentSelectedId !== itemId) {
          return currentSelectedId;
        }
        return next[0]?.id ?? null;
      });
      return next;
    });
  }

  function onSequenceDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragOverSequence(true);
  }

  function onSequenceDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    // Only set to false if we're actually leaving the sequence area
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setDragOverSequence(false);
    }
  }

  function onSequenceDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragOverSequence(false);

    const files = Array.from(event.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    if (files.length > 0) {
      onFilesPicked(files);
    }
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function openImportPicker() {
    importInputRef.current?.click();
  }

  function openAudioPicker() {
    audioInputRef.current?.click();
  }

  function getSectionName(sectionIndex: number, totalSections: number): string {
    if (sectionIndex === 1) {
      return "Intro";
    }
    if (sectionIndex === totalSections) {
      return "Final burst";
    }
    return `Section ${sectionIndex}`;
  }

  async function onRegeneratePrompts() {
    if (!items.length) {
      setStatus("Add images before regenerating prompts.");
      return;
    }

    setStatus("Regenerating prompts from images...");
    const currentItems = [...items];
    const totalSections = currentItems.length;

    setItems((prev) => prev.map((item) => ({ ...item, analyzing: true })));

    for (const [index, item] of currentItems.entries()) {
      try {
        const { base64Data, mimeType } = splitDataUrl(item.src);
        const sectionIndex = index + 1;
        const sectionName = getSectionName(sectionIndex, totalSections);
        const result = await analyzeImageWithProvider(base64Data, mimeType, {
          sectionName,
          sectionIndex,
          totalSections,
          selectedGenres
        });
        const previousItem = currentItems[index - 1];
        const diversified = applySimilarityDiversification(result, previousItem);
        const mood = result.sceneMood?.trim() || "Unknown";

        currentItems[index] = {
          ...currentItems[index],
          emotion: mood,
          positiveLocalStyles: diversified.positiveLocalStyles,
          negativeLocalStyles: diversified.negativeLocalStyles,
          prompt: diversified.prompt,
          analyzing: false,
          valence: result.valence,
          arousal: result.arousal,
          dominance: result.dominance,
          brightness: result.brightness,
          motion: result.motion,
          palette: result.palette,
          texture: result.texture,
          sectionName
        };

        setItems((prev) =>
          prev.map((current) =>
            current.id === item.id
              ? {
                ...current,
                emotion: mood,
                positiveLocalStyles: diversified.positiveLocalStyles,
                negativeLocalStyles: diversified.negativeLocalStyles,
                prompt: diversified.prompt,
                analyzing: false,
                valence: result.valence,
                arousal: result.arousal,
                dominance: result.dominance,
                brightness: result.brightness,
                motion: result.motion,
                palette: result.palette,
                texture: result.texture,
                sectionName
              }
              : current
          )
        );
      } catch (error) {
        setItems((prev) =>
          prev.map((current) =>
            current.id === item.id
              ? {
                ...current,
                analyzing: false
              }
              : current
          )
        );
        setStatus(error instanceof Error ? error.message : "Failed to regenerate prompts.");
      }
    }

    setStatus("Prompts regenerated from images.");
  }

  function toggleGenre(genre: string) {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((item) => item !== genre) : [...prev, genre]
    );
  }

  function toggleNegativePrompt(prompt: string) {
    setSelectedNegativePrompts((prev) =>
      prev.includes(prompt) ? prev.filter((item) => item !== prompt) : [...prev, prompt]
    );
  }

  function addCustomPositivePrompt() {
    const value = newPositivePrompt.trim();
    if (!value) {
      return;
    }
    setCustomPositivePrompts((prev) => (prev.includes(value) ? prev : [...prev, value]));
    setNewPositivePrompt("");
  }

  function removeCustomPositivePrompt(prompt: string) {
    setCustomPositivePrompts((prev) => prev.filter((item) => item !== prompt));
  }

  function addCustomNegativePrompt() {
    const value = newNegativePrompt.trim();
    if (!value) {
      return;
    }
    setCustomNegativePrompts((prev) => (prev.includes(value) ? prev : [...prev, value]));
    setNewNegativePrompt("");
  }

  function removeCustomNegativePrompt(prompt: string) {
    setCustomNegativePrompts((prev) => prev.filter((item) => item !== prompt));
  }

  function addLocalPositiveStyle() {
    const value = newLocalPositivePrompt.trim();
    if (!value || !selectedId) return;
    setItems((prev) =>
      prev.map((item) =>
        item.id === selectedId && !item.positiveLocalStyles.includes(value)
          ? { ...item, positiveLocalStyles: [...item.positiveLocalStyles, value] }
          : item
      )
    );
    setNewLocalPositivePrompt("");
  }

  function removeLocalPositiveStyle(tag: string) {
    if (!selectedId) return;
    setItems((prev) =>
      prev.map((item) =>
        item.id === selectedId
          ? { ...item, positiveLocalStyles: item.positiveLocalStyles.filter((s) => s !== tag) }
          : item
      )
    );
  }

  function addLocalNegativeStyle() {
    const value = newLocalNegativePrompt.trim();
    if (!value || !selectedId) return;
    setItems((prev) =>
      prev.map((item) =>
        item.id === selectedId && !item.negativeLocalStyles.includes(value)
          ? { ...item, negativeLocalStyles: [...item.negativeLocalStyles, value] }
          : item
      )
    );
    setNewLocalNegativePrompt("");
  }

  function removeLocalNegativeStyle(tag: string) {
    if (!selectedId) return;
    setItems((prev) =>
      prev.map((item) =>
        item.id === selectedId
          ? { ...item, negativeLocalStyles: item.negativeLocalStyles.filter((s) => s !== tag) }
          : item
      )
    );
  }

  async function getAudioDataUrl(blobUrl: string): Promise<string> {
    try {
      const response = await fetch(blobUrl);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error("Failed to convert audio to data URL:", error);
      return "";
    }
  }

  async function onExportComposition() {
    const exportData: ExportFile = {
      version: 1,
      exportedAt: new Date().toISOString(),
      aiProvider,
      totalDurationSec,
      generalPrompt,
      selectedGenres,
      selectedNegativePrompts,
      customPositivePrompts,
      customNegativePrompts,
      forceInstrumental,
      items: items.map((item) => ({
        id: item.id,
        src: item.src,
        name: item.name,
        emotion: item.emotion,
        prompt: item.prompt,
        durationSec: item.durationSec,
        positiveLocalStyles: item.positiveLocalStyles,
        negativeLocalStyles: item.negativeLocalStyles,
        valence: item.valence,
        arousal: item.arousal,
        dominance: item.dominance,
        brightness: item.brightness,
        motion: item.motion,
        palette: item.palette,
        texture: item.texture,
        sectionName: item.sectionName
      }))
    };

    if (audioUrl) {
      setStatus("Exporting composition with audio...");
      const audioDataUrl = await getAudioDataUrl(audioUrl);
      if (audioDataUrl) {
        exportData.audioUrl = audioDataUrl;
      }
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `image-sound-composer-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("Composition exported.");
  }

  async function onImportComposition(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) {
      return;
    }

    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as Partial<ExportFile>;

      if (parsed.version !== 1 || !Array.isArray(parsed.items)) {
        throw new Error("Invalid composition file format");
      }

      const fallbackDurationSec =
        typeof parsed.totalDurationSec === "number" &&
          Number.isFinite(parsed.totalDurationSec) &&
          parsed.totalDurationSec > 0 &&
          parsed.items.length > 0
          ? Math.max(1, Math.round(parsed.totalDurationSec / parsed.items.length))
          : DEFAULT_IMAGE_DURATION_SEC;

      const importedItems: ImageItem[] = parsed.items
        .filter((item): item is NonNullable<ExportFile["items"][number]> => Boolean(item))
        .map((item, index) => ({
          id: typeof item.id === "string" ? item.id : `imported-${generateId()}`,
          src: typeof item.src === "string" ? item.src : "",
          name: typeof item.name === "string" ? item.name : "Imported image",
          emotion: typeof item.emotion === "string" ? item.emotion : "Unknown",
          prompt: typeof item.prompt === "string" ? item.prompt : DEFAULT_PROMPT,
          durationSec:
            typeof item.durationSec === "number" && Number.isFinite(item.durationSec) && item.durationSec > 0
              ? Math.round(item.durationSec)
              : fallbackDurationSec,
          positiveLocalStyles: Array.isArray(item.positiveLocalStyles)
            ? item.positiveLocalStyles.filter((value): value is string => typeof value === "string")
            : [],
          negativeLocalStyles: Array.isArray(item.negativeLocalStyles)
            ? item.negativeLocalStyles.filter((value): value is string => typeof value === "string")
            : [],
          analyzing: false,
          valence: typeof item.valence === "number" ? item.valence : undefined,
          arousal: typeof item.arousal === "number" ? item.arousal : undefined,
          dominance: typeof item.dominance === "number" ? item.dominance : undefined,
          brightness: typeof item.brightness === "number" ? item.brightness : undefined,
          motion: typeof item.motion === "number" ? item.motion : undefined,
          palette: typeof item.palette === "string" ? item.palette : undefined,
          texture: typeof item.texture === "string" ? item.texture : undefined,
          sectionName: getSectionName(index + 1, parsed.items.length)
        }))
        .filter((item) => item.src.startsWith("data:image/"));

      setItems(importedItems);
      setSelectedId(importedItems[0]?.id ?? null);
      setAiProvider(parsed.aiProvider === "claude" ? "claude" : "gemini");
      setSelectedGenres(
        Array.isArray(parsed.selectedGenres)
          ? parsed.selectedGenres.filter((value): value is string => typeof value === "string")
          : ["cinematic"]
      );
      setSelectedNegativePrompts(
        Array.isArray(parsed.selectedNegativePrompts)
          ? parsed.selectedNegativePrompts.filter((value): value is string => typeof value === "string")
          : ["comercial", "stock", "folk", "celtic", "corporate"]
      );
      setCustomPositivePrompts(
        Array.isArray(parsed.customPositivePrompts)
          ? parsed.customPositivePrompts.filter((value): value is string => typeof value === "string")
          : []
      );
      setCustomNegativePrompts(
        Array.isArray(parsed.customNegativePrompts)
          ? parsed.customNegativePrompts.filter((value): value is string => typeof value === "string")
          : []
      );
      setGeneralPrompt(typeof parsed.generalPrompt === "string" ? parsed.generalPrompt : "");
      setTotalDurationSec(
        typeof parsed.totalDurationSec === "number" && Number.isFinite(parsed.totalDurationSec)
          ? Math.max(10, Math.round(parsed.totalDurationSec))
          : 120
      );
      setForceInstrumental(Boolean(parsed.forceInstrumental));
      if (typeof parsed.audioUrl === "string" && parsed.audioUrl) {
        if (audioUrl) {
          revokeAudioUrl(audioUrl);
        }
        setAudioUrl(parsed.audioUrl);
      }
      setStatus(`Composition imported (${importedItems.length} images).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to import composition.");
    }
  }

  async function onAudioPicked(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) {
      return;
    }
    if (audioUrl) {
      revokeAudioUrl(audioUrl);
    }
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    setStatus(`Audio imported (${file.name}).`);
  }

  async function onSendPrompt() {
    if (!musicPrompt.sections.length) {
      setStatus("Nothing to send. Add images first.");
      return;
    }

    try {
      setStatus("Sending section-based music prompt to ElevenLabs...");
      if (audioUrl) {
        revokeAudioUrl(audioUrl);
      }
      const url = await sendPromptToElevenLabs(musicPrompt, { forceInstrumental }, elevenLabsApiKey || undefined);
      setAudioUrl(url);
      setStatus("Audio generated successfully.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to send prompt to ElevenLabs");
    }
  }

  function onDownloadAudio() {
    if (!audioUrl) {
      setStatus("No generated audio available to download.");
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = audioUrl;
    anchor.download = `image-sound-composer-${new Date().toISOString().replace(/[:.]/g, "-")}.mp3`;
    anchor.click();
  }

  return (
    <>
      <main className="container-fluid py-3">
        <div className="col">
          <div className="row g-3">
            <section className="offset-1 col-8">

              <div className="card">
                <div className="card-body">
                  <h1 className="h1 text-primary mb-3">Visual rhythms</h1>
                  {status && <div className="alert alert-info py-2 px-3 small mb-2">{status}</div>}

                  <div className="row mt-5">
                    <div className="d-flex flex-wrap gap-2 justify-content-end padding-right">

                      <button
                        className="btn btn-clean btn-icon"
                        onClick={() => {
                          setDraftClaudeKey(claudeApiKey);
                          setDraftElevenLabsKey(elevenLabsApiKey);
                          setShowApiKeysModal(true);
                        }}
                        aria-label="API keys"
                        title="API keys"
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">key_vertical</span>
                      </button>
                      <button
                        className="btn btn-clean btn-icon"
                        onClick={onExportComposition}
                        aria-label="Export composition"
                        title="Export composition"
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">download</span>
                      </button>
                      <button
                        className="btn btn-clean btn-icon"
                        onClick={openImportPicker}
                        aria-label="Import composition"
                        title="Import composition"
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">upload</span>
                      </button>
                      <button
                        className="btn btn-clean btn-icon"
                        onClick={onRegeneratePrompts}
                        aria-label="Re analyze images"
                        title="Re analyze images"
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
                      </button>
                      <button className="btn btn-primary btn-generate" onClick={onSendPrompt}>
                        Generate
                      </button>
                    </div>
                  </div>

                  <div className="sequence-wrapper mb-5">
                    <button
                      type="button"
                      className="sequence-scroll-btn sequence-scroll-btn-left"
                      onClick={() => scrollSequence("left")}
                      aria-label="Scroll left"
                    >
                      <span className="material-symbols-outlined">chevron_left</span>
                    </button>
                  <div
                    ref={sequenceRef}
                    className={`sequence ${dragOverSequence ? 'drag-over' : ''}`}
                    onDragOver={onSequenceDragOver}
                    onDragLeave={onSequenceDragLeave}
                    onDrop={onSequenceDrop}
                  >
                    {items.map((item) => (
                      <article
                        key={item.id}
                        className={`image-card ${selectedId === item.id ? "selected" : ""}`}
                        draggable
                        onClick={() => setSelectedId(item.id)}
                        onDragStart={() => setDraggingId(item.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          if (draggingId) {
                            moveItem(draggingId, item.id);
                          }
                        }}
                        onDragEnd={() => setDraggingId(null)}
                      >
                        <div className="image-frame">
                          <button
                            type="button"
                            className="remove-image-btn btn btn-sm btn-danger"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeImage(item.id);
                            }}
                            aria-label={`Remove ${item.name}`}
                            title="Remove image"
                          >
                            X
                          </button>
                          <img src={item.src} alt={item.name} />
                          {labelEditingId === item.id ? (
                            <input
                              autoFocus
                              className="emotion-tag emotion-tag-input"
                              type="text"
                              value={item.emotion}
                              onChange={(event) => { event.stopPropagation(); onItemLabelChange(item.id, event.target.value); }}
                              onBlur={() => setLabelEditingId(null)}
                              onKeyDown={(event) => { if (event.key === "Enter" || event.key === "Escape") setLabelEditingId(null); }}
                              onClick={(event) => event.stopPropagation()}
                              onMouseDown={(event) => event.stopPropagation()}
                              aria-label={`Label for ${item.name}`}
                            />
                          ) : (
                            <p
                              className="emotion-tag"
                              onClick={(event) => { event.stopPropagation(); if (!item.analyzing) setLabelEditingId(item.id); }}
                              title="Click to edit label"
                            >
                              {item.analyzing ? "Analyzing..." : item.emotion}
                            </p>
                          )}
          
                          <div
                            className="duration-inline"
                            onClick={(event) => event.stopPropagation()}
                            onMouseDown={(event) => event.stopPropagation()}
                            onDoubleClick={() => setDurationEditingId(item.id)}
                            title="Double click to edit duration"
                          >
                            {durationEditingId === item.id ? (
                              <>
                                <span>s</span>
                                <input
                                  autoFocus
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={item.durationSec ?? ""}
                                  onChange={(event) => onItemDurationChange(item.id, event.target.value)}
                                  onBlur={stopDurationEditing}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === "Escape") {
                                      stopDurationEditing();
                                    }
                                  }}
                                  aria-label={`Duration for ${item.name}`}
                                />
                              </>
                            ) : (
                              <span className="duration-readout">{item.durationSec ?? 0}s</span>
                            )}
                          </div>
                                                           {item.sectionName && (
                            <p className="section-name-tag">
                              {item.sectionName}
                            </p>
                          )}
                        </div>
                 
                      </article>
                    ))}

                    <article
                      className="image-card add-card"
                      role="button"
                      tabIndex={0}
                      onClick={openFilePicker}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openFilePicker();
                        }
                      }}
                      aria-label="Add a new image"
                    >
                      <span className="plus">+</span>
                    </article>
                  </div>
                    <button
                      type="button"
                      className="sequence-scroll-btn sequence-scroll-btn-right"
                      onClick={() => scrollSequence("right")}
                      aria-label="Scroll right"
                    >
                      <span className="material-symbols-outlined">chevron_right</span>
                    </button>
                  </div>
                </div>
              </div>
              <CustomAudioPlayer src={audioUrl || undefined} onDownload={onDownloadAudio} openAudioPicker={openAudioPicker} />
            </section>

            <section className="col-3">
              <div className="card shadow-sm border-primary-subtle">
                <div className="card-body">
                  <h2 className="h6 text-uppercase text-primary mb-3">Track</h2>
                  <hr className="my-3" />
                  <p className="small mb-3 text-primary-emphasis">Positive tags:</p>
                  <div className="floating-tags mb-2">
                    {musicPrompt.positiveGlobalStyles.map((tag) => (
                      <button
                        key={`global-positive-${tag}`}
                        type="button"
                        className="badge text-bg-primary tag-removable"
                        onClick={() => selectedGenres.includes(tag) ? toggleGenre(tag) : removeCustomPositivePrompt(tag)}
                        title="Remove"
                      >
                        {tag}
                      </button>
                    ))}
                    <input
                      type="text"
                      className="prompt-inline-input"
                      value={newPositivePrompt}
                      onChange={(e) => setNewPositivePrompt(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomPositivePrompt(); } }}
                      onBlur={() => { if (newPositivePrompt.trim()) addCustomPositivePrompt(); }}
                      placeholder="+ add prompt"
                    />
                  </div>
                  <p className="small mb-3 mt-4 text-primary-emphasis">Negative tags:</p>
                  <div className="floating-tags">
                    {musicPrompt.negativeGlobalStyles.map((tag) => (
                      <button
                        key={`global-negative-${tag}`}
                        type="button"
                        className="badge text-bg-danger  tag-removable"
                        onClick={() => selectedNegativePrompts.includes(tag) ? toggleNegativePrompt(tag) : removeCustomNegativePrompt(tag)}
                        title="Remove"
                      >
                        {tag}
                      </button>
                    ))}
                    <input
                      type="text"
                      className="prompt-inline-input prompt-inline-input--negative"
                      value={newNegativePrompt}
                      onChange={(e) => setNewNegativePrompt(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomNegativePrompt(); } }}
                      onBlur={() => { if (newNegativePrompt.trim()) addCustomNegativePrompt(); }}
                      placeholder="+ add prompt"
                    />
                  </div>

                  {selectedItem ? (
                    <div className="selected-mini-card  mt-4">
                      
                  <h2 className="h6 fw-semibold mb-2 pt-8">Selected Image</h2>
                  <hr className="my-3" />
                      <div className="selected-mini-card-top">
                        <img src={selectedItem.src} alt={selectedItem.name} className="selected-mini-image" />
                        <dl className="selected-mini-stats">
                          {selectedItem.valence !== undefined && <><dt>Valence</dt><dd>{selectedItem.valence.toFixed(2)}</dd></>}
                          {selectedItem.arousal !== undefined && <><dt>Arousal</dt><dd>{selectedItem.arousal.toFixed(2)}</dd></>}
                          {selectedItem.dominance !== undefined && <><dt>Dominance</dt><dd>{selectedItem.dominance.toFixed(2)}</dd></>}
                          {selectedItem.brightness !== undefined && <><dt>Brightness</dt><dd>{selectedItem.brightness.toFixed(2)}</dd></>}
                          {selectedItem.motion !== undefined && <><dt>Motion</dt><dd>{selectedItem.motion.toFixed(2)}</dd></>}
                          {selectedItem.palette && <><dt>Palette</dt><dd>{selectedItem.palette}</dd></>}
                          {selectedItem.texture && <><dt>Texture</dt><dd>{selectedItem.texture}</dd></>}
                          {selectedItem.emotion && <><dt>Mood</dt><dd>{selectedItem.emotion}</dd></>}
                        </dl>
                      </div>
                      <p className="small mb-1 mt-2 text-primary-emphasis">Positive</p>
                      <div className="floating-tags mb-2">
                        {selectedSection?.positiveLocalStyles.map((tag, index) => (
                          <button
                            key={`${selectedItem.id}-pos-${tag}-${index}`}
                            type="button"
                            className="badge text-bg-primary  tag-removable"
                            onClick={() => removeLocalPositiveStyle(tag)}
                            title="Remove"
                          >
                            {tag}
                          </button>
                        ))}
                        <input
                          type="text"
                          className="prompt-inline-input"
                          value={newLocalPositivePrompt}
                          onChange={(e) => setNewLocalPositivePrompt(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLocalPositiveStyle(); } }}
                          onBlur={() => { if (newLocalPositivePrompt.trim()) addLocalPositiveStyle(); }}
                          placeholder="+ add prompt"
                        />
                      </div>
                      <p className="small mb-1 text-danger-emphasis">Negative</p>
                      <div className="floating-tags">
                        {selectedSection?.negativeLocalStyles.map((tag, index) => (
                          <button
                            key={`${selectedItem.id}-neg-${tag}-${index}`}
                            type="button"
                            className="badge text-bg-danger  tag-removable"
                            onClick={() => removeLocalNegativeStyle(tag)}
                            title="Remove"
                          >
                            {tag}
                          </button>
                        ))}
                        <input
                          type="text"
                          className="prompt-inline-input prompt-inline-input--negative"
                          value={newLocalNegativePrompt}
                          onChange={(e) => setNewLocalNegativePrompt(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLocalNegativeStyle(); } }}
                          onBlur={() => { if (newLocalNegativePrompt.trim()) addLocalNegativeStyle(); }}
                          placeholder="+ add prompt"
                        />
                      </div>
                    </div>
                  ) : (
                    <div> 
                    <hr className="my-3" /><span className="text-muted small">Select an image to preview it here.</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="card shadow-sm border-primary-subtle">
                <div className="card-body">
                  <h2 className="h5 mb-3">Inspirational Tags</h2>
                    <hr className="my-3" />
                  <div className="row">
                    <div className="col-12">
                      <p className="small mb-3 text-primary-emphasis">Positive styles:</p>
                      <div className="genre-list mb-2">
                        {GENRE_OPTIONS.map((genre) => (
                          <button
                            key={genre}
                            type="button"
                            className={`badge btn-sm ${selectedGenres.includes(genre) ? "btn-primary tag-removable" : "btn-outline-secondary"}`}
                            onClick={() => toggleGenre(genre)}
                          >
                            {genre}
                          </button>
                        ))}
                        {customPositivePrompts.map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            className="badge btn-sm btn-primary tag-removable"
                            onClick={() => removeCustomPositivePrompt(prompt)}
                            title="Remove custom positive prompt"
                          >
                            {prompt}
                          </button>
                        ))}
                        <input
                          type="text"
                          className="prompt-inline-input"
                          value={newPositivePrompt}
                          onChange={(event) => setNewPositivePrompt(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              addCustomPositivePrompt();
                            }
                          }}
                          onBlur={() => {
                            if (newPositivePrompt.trim()) addCustomPositivePrompt();
                          }}
                          placeholder="+ add prompt"
                        />
                      </div>
                    </div>
                    <div className="col-12">
                      <p className="small  mb-3 mt-4 text-primary-emphasis">Negative prompts:</p>
                      <div className="genre-list mb-2">
                        {NEGATIVE_PROMPT_OPTIONS.map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            className={`badge btn-sm ${selectedNegativePrompts.includes(prompt) ? "btn-danger tag-removable" : "btn-outline-secondary"}`}
                            onClick={() => toggleNegativePrompt(prompt)}
                          >
                            {prompt}
                          </button>
                        ))}
                        {customNegativePrompts.map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            className="badge btn-sm btn-danger tag-removable"
                            onClick={() => removeCustomNegativePrompt(prompt)}
                            title="Remove custom negative prompt"
                          >
                            {prompt}
                          </button>
                        ))}
                        <input
                          type="text"
                          className="prompt-inline-input prompt-inline-input--negative"
                          value={newNegativePrompt}
                          onChange={(event) => setNewNegativePrompt(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              addCustomNegativePrompt();
                            }
                          }}
                          onBlur={() => {
                            if (newNegativePrompt.trim()) addCustomNegativePrompt();
                          }}
                          placeholder="+ add prompt"
                        />
                      </div>
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => {
                      onFilesPicked(event.target.files);
                      event.currentTarget.value = "";
                    }}
                    aria-label="Add images"
                    style={{ position: "absolute", left: "-9999px", pointerEvents: "auto" }}
                  />
                  <input
                    ref={importInputRef}
                    type="file"
                    accept="application/json"
                    onChange={(event) => {
                      onImportComposition(event.target.files);
                      event.currentTarget.value = "";
                    }}
                    aria-label="Import composition"
                    style={{ position: "absolute", left: "-9999px", pointerEvents: "auto" }}
                  />
                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={(event) => {
                      onAudioPicked(event.target.files);
                      event.currentTarget.value = "";
                    }}
                    aria-label="Import audio"
                    style={{ position: "absolute", left: "-9999px", pointerEvents: "auto" }}
                  />
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      {showApiKeysModal && (
        <div className="api-keys-overlay" onClick={() => setShowApiKeysModal(false)}>
          <div className="api-keys-modal" onClick={(e) => e.stopPropagation()}>
            <div className="api-keys-modal-header">
              <h2 className="api-keys-modal-title">API Keys</h2>
              <button
                type="button"
                className="btn-clean btn-icon"
                onClick={() => setShowApiKeysModal(false)}
                aria-label="Close"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="api-keys-modal-hint">
              Leave blank to use the keys configured in <code>.env</code>.
            </p>
            <label className="api-keys-label">
              Claude API Key
              <input
                type="password"
                className="api-keys-input"
                placeholder="sk-ant-..."
                value={draftClaudeKey}
                onChange={(e) => setDraftClaudeKey(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            <label className="api-keys-label">
              ElevenLabs API Key
              <input
                type="password"
                className="api-keys-input"
                placeholder="sk_..."
                value={draftElevenLabsKey}
                onChange={(e) => setDraftElevenLabsKey(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            <div className="api-keys-modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setDraftClaudeKey("");
                  setDraftElevenLabsKey("");
                  setClaudeApiKey("");
                  setElevenLabsApiKey("");
                  localStorage.removeItem("user_claude_api_key");
                  localStorage.removeItem("user_elevenlabs_api_key");
                  setShowApiKeysModal(false);
                }}
              >
                Clear
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setClaudeApiKey(draftClaudeKey);
                  setElevenLabsApiKey(draftElevenLabsKey);
                  if (draftClaudeKey) {
                    localStorage.setItem("user_claude_api_key", draftClaudeKey);
                  } else {
                    localStorage.removeItem("user_claude_api_key");
                  }
                  if (draftElevenLabsKey) {
                    localStorage.setItem("user_elevenlabs_api_key", draftElevenLabsKey);
                  } else {
                    localStorage.removeItem("user_elevenlabs_api_key");
                  }
                  setShowApiKeysModal(false);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
