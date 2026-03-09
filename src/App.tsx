import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeImageEmotionWithClaude } from "./claude";
import CustomAudioPlayer from "./CustomAudioPlayer";
import {  revokeAudioUrl, sendPromptToElevenLabs } from "./elevenlabs";
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
  items: Array<{
    id: string;
    src: string;
    name: string;
    emotion: string;
    prompt: string;
    durationSec?: number;
    positiveLocalStyles: string[];
    negativeLocalStyles: string[];
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

export default function App() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [durationEditingId, setDurationEditingId] = useState<string | null>(null);
  const [promptPanelMinimized, setPromptPanelMinimized] = useState<boolean>(false);
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
  const [totalDurationSec, setTotalDurationSec] = useState<number>(120);
  const [generalPrompt, setGeneralPrompt] = useState<string>("");
  const [forceInstrumental, setForceInstrumental] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");
  const [audioUrl, setAudioUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

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
      return analyzeImageEmotionWithClaude(base64Data, mimeType, context);
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

  async function onFilesPicked(fileList: FileList | null) {
    if (!fileList?.length) {
      return;
    }

    const files = Array.from(fileList);
    const newItems: ImageItem[] = [];

    for (const file of files) {
      const src = await fileToDataUrl(file);
      newItems.push({
        id: `${file.name}-${crypto.randomUUID()}`,
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

        const result = await analyzeImageWithProvider(base64Data, mimeType, {
          sectionName,
          sectionIndex,
          totalSections: totalAfterUpload,
          selectedGenres
        });
        const previousItem = workingItems[items.length + offset - 1];
        const diversified = applySimilarityDiversification(result, previousItem);
        const mood = result.sceneMood?.trim() || "Unknown";

        workingItems[items.length + offset] = {
          ...workingItems[items.length + offset],
          emotion: mood,
          positiveLocalStyles: diversified.positiveLocalStyles,
          negativeLocalStyles: diversified.negativeLocalStyles,
          prompt: diversified.prompt,
          analyzing: false
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
                analyzing: false
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

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function openImportPicker() {
    importInputRef.current?.click();
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
        const result = await analyzeImageWithProvider(base64Data, mimeType, {
          sectionName: getSectionName(sectionIndex, totalSections),
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
          analyzing: false
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
                analyzing: false
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

  function onExportComposition() {
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
        negativeLocalStyles: item.negativeLocalStyles
      }))
    };

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
        .map((item) => ({
          id: typeof item.id === "string" ? item.id : `imported-${crypto.randomUUID()}`,
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
          analyzing: false
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
      setStatus(`Composition imported (${importedItems.length} images).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to import composition.");
    }
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
      const url = await sendPromptToElevenLabs(musicPrompt, { forceInstrumental });
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
          <div className= "col">
            <div className="row g-3">
              <section className="col-12">
                    <div className="row">
                      <div className="d-flex flex-wrap gap-2">
                        <button className="btn btn-primary" onClick={onSendPrompt}>
                          Generate
                        </button>
                        <button
                          className="btn btn-outline-secondary btn-icon"
                          onClick={onExportComposition}
                          aria-label="Export composition"
                          title="Export composition"
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">download</span>
                        </button>
                        <button
                          className="btn btn-outline-secondary btn-icon"
                          onClick={openImportPicker}
                          aria-label="Import composition"
                          title="Import composition"
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">upload</span>
                        </button>
                          <button
                            className="btn btn-outline-primary btn-icon"
                            onClick={onRegeneratePrompts}
                            aria-label="Re analyze images"
                            title="Re analyze images"
                          >
                            <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
                          </button>
                      </div>
                    </div>
              </section>

              <section className="col-12">
                <div className="card">
                  <div className="card-body">
                    <h2 className="h6 text-uppercase text-primary mb-3">Image Composer</h2>
                    <div className="sequence">
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
                            <p className="emotion-tag">{item.analyzing ? "Analyzing..." : item.emotion}</p>
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
                  </div>
                </div>
              </section>

              <section className="offset-2 col-8">
                  <CustomAudioPlayer src={audioUrl || undefined} onDownload={onDownloadAudio} />
              </section>

              
              <section className="col-12">
                    <div className="row">
                        {status && <div className="alert alert-info py-2 px-3 small mb-2">{status}</div>}
                      </div>
              </section>

            </div>
        </div>
      </main>

      <aside className={`floating-prompt-panel card shadow-sm border-primary-subtle ${promptPanelMinimized ? "minimized" : ""}`}>
        {!promptPanelMinimized ? (
          <div className="card-body">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <h2 className="h6 text-uppercase text-primary mb-0">Prompt Tags</h2>
              <button
                className="btn btn-sm btn-outline-primary"
                onClick={() => setPromptPanelMinimized(true)}
                aria-label="Minimize prompt tags panel"
              >
                -
              </button>
            </div>
            <p className="small fw-semibold mb-2">General Prompt</p>
            <p className="small mb-1 text-primary-emphasis">Positive</p>
            <div className="floating-tags mb-2">
              {musicPrompt.positiveGlobalStyles.length ? (
                musicPrompt.positiveGlobalStyles.map((tag) => (
                  <span key={`global-positive-${tag}`} className="badge text-bg-primary">
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-muted small">No positive global styles yet.</span>
              )}
            </div>
            <p className="small mb-1 text-danger-emphasis">Negative</p>
            <div className="floating-tags">
              {musicPrompt.negativeGlobalStyles.length ? (
                musicPrompt.negativeGlobalStyles.map((tag) => (
                  <span key={`global-negative-${tag}`} className="badge text-bg-danger">
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-muted small">No negative global styles yet.</span>
              )}
            </div>
            <hr className="my-3" />
            <p className="small fw-semibold mb-2">Selected Image</p>
            {selectedItem ? (
              <div className="selected-mini-card">
                <img src={selectedItem.src} alt={selectedItem.name} className="selected-mini-image" />
                <p className="small mb-1 mt-2 text-primary-emphasis">Positive</p>
                <div className="floating-tags mb-2">
                  {selectedSection?.positiveLocalStyles.length ? (
                    selectedSection.positiveLocalStyles.map((tag, index) => (
                      <span key={`${selectedItem.id}-pos-${tag}-${index}`} className="badge text-bg-primary">
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-muted small">No positive local styles for this image.</span>
                  )}
                </div>
                <p className="small mb-1 text-danger-emphasis">Negative</p>
                <div className="floating-tags">
                  {selectedSection?.negativeLocalStyles.length ? (
                    selectedSection.negativeLocalStyles.map((tag, index) => (
                      <span key={`${selectedItem.id}-neg-${tag}-${index}`} className="badge text-bg-danger">
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-muted small">No negative local styles for this image.</span>
                  )}
                </div>
              </div>
            ) : (
              <span className="text-muted small">Select an image to preview it here.</span>
            )}
            <hr className="my-3" />

              <section className="col-12">
                <div className="card shadow-sm border-primary-subtle">
                  <div className="card-body">
                    <h1 className="h4 mb-3">Total {totalDurationSec} seconds</h1>
                    <div className="row">
                      <div className="col-6">
                        <label className="form-label fw-semibold mb-2">Positive Global Styles</label>
                        <div className="genre-list mb-2">
                          {GENRE_OPTIONS.map((genre) => (
                            <button
                              key={genre}
                              type="button"
                              className={`btn btn-sm ${selectedGenres.includes(genre) ? "btn-primary" : "btn-outline-secondary"}`}
                              onClick={() => toggleGenre(genre)}
                            >
                              {genre}
                            </button>
                          ))}
                        </div>
                        <label htmlFor="custom-positive-prompt" className="form-label fw-semibold mb-1">
                          Add positive prompt
                        </label>
                        <div className="input-group input-group-sm mb-2">
                          <input
                            id="custom-positive-prompt"
                            type="text"
                            className="form-control"
                            value={newPositivePrompt}
                            onChange={(event) => setNewPositivePrompt(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                addCustomPositivePrompt();
                              }
                            }}
                            placeholder="e.g. evolving strings"
                          />
                          <button type="button" className="btn btn-outline-primary" onClick={addCustomPositivePrompt}>
                            Add
                          </button>
                        </div>
                        {customPositivePrompts.length > 0 && (
                          <div className="genre-list mb-2">
                            {customPositivePrompts.map((prompt) => (
                              <button
                                key={prompt}
                                type="button"
                                className="btn btn-sm btn-primary"
                                onClick={() => removeCustomPositivePrompt(prompt)}
                                title="Remove custom positive prompt"
                              >
                                {prompt}
                              </button>
                            ))}
                          </div>
                        )}

                      </div>
                      <div className="col-6">
                        <label className="form-label fw-semibold mb-2">Negative Prompts</label>
                        <div className="genre-list mb-2">
                          {NEGATIVE_PROMPT_OPTIONS.map((prompt) => (
                            <button
                              key={prompt}
                              type="button"
                              className={`btn btn-sm ${selectedNegativePrompts.includes(prompt) ? "btn-danger" : "btn-outline-secondary"}`}
                              onClick={() => toggleNegativePrompt(prompt)}
                            >
                              {prompt}
                            </button>
                          ))}
                        </div>
                        <label htmlFor="custom-negative-prompt" className="form-label fw-semibold mb-1">
                          Add negative prompt
                        </label>
                        <div className="input-group input-group-sm mb-2">
                          <input
                            id="custom-negative-prompt"
                            type="text"
                            className="form-control"
                            value={newNegativePrompt}
                            onChange={(event) => setNewNegativePrompt(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                addCustomNegativePrompt();
                              }
                            }}
                            placeholder="e.g. heavy vocals"
                          />
                          <button type="button" className="btn btn-outline-danger" onClick={addCustomNegativePrompt}>
                            Add
                          </button>
                        </div>
                        {customNegativePrompts.length > 0 && (
                          <div className="genre-list mb-2">
                            {customNegativePrompts.map((prompt) => (
                              <button
                                key={prompt}
                                type="button"
                                className="btn btn-sm btn-danger"
                                onClick={() => removeCustomNegativePrompt(prompt)}
                                title="Remove custom negative prompt"
                              >
                                {prompt}
                              </button>
                            ))}
                          </div>
                        )}
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
                      className="d-none"
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
                      className="d-none"
                    />
                  </div>
                </div>
              </section>
          </div>
        ) : (
          <button
            className="prompt-panel-restore btn btn-outline-primary"
            onClick={() => setPromptPanelMinimized(false)}
            aria-label="Expand prompt tags panel"
            title="Expand prompt tags panel"
          >
           +
          </button>
        )}
      </aside>

    </>
  );
}
