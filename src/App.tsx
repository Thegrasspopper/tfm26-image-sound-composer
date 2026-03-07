import { useMemo, useRef, useState } from "react";
import { analyzeImageEmotion } from "./gemini";
import { sendPromptToElevenLabs } from "./elevenlabs";
import { buildCombinedPrompt, fileToDataUrl, splitDataUrl } from "./utils";

type ImageItem = {
  id: string;
  src: string;
  name: string;
  emotion: string;
  prompt: string;
  analyzing: boolean;
};

const DEFAULT_PROMPT = "Describe the musical idea this image should contribute.";

export default function App() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [audioUrl, setAudioUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedItem = items.find((item) => item.id === selectedId) ?? null;

  const combinedPrompt = useMemo(() => {
    return buildCombinedPrompt(items.map((item) => `${item.emotion}: ${item.prompt}`));
  }, [items]);

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
        analyzing: true
      });
    }

    setItems((prev) => [...prev, ...newItems]);
    if (!selectedId && newItems[0]) {
      setSelectedId(newItems[0].id);
    }

    for (const item of newItems) {
      try {
        const { base64Data, mimeType } = splitDataUrl(item.src);
        const result = await analyzeImageEmotion(base64Data, mimeType);
        setItems((prev) =>
          prev.map((current) =>
            current.id === item.id
              ? {
                  ...current,
                  emotion: result.emotion,
                  prompt:
                    result.emotion && current.prompt === DEFAULT_PROMPT
                      ? `Music inspired by ${result.emotion.toLowerCase()} from ${current.name}`
                      : current.prompt,
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

    setItems((prev) => prev.map((item) => (item.id === selectedId ? { ...item, prompt: value } : item)));
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

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  async function onSendPrompt() {
    if (!combinedPrompt.trim()) {
      setStatus("Nothing to send. Add images and prompts first.");
      return;
    }

    try {
      setStatus("Sending prompt to ElevenLabs...");
      const url = await sendPromptToElevenLabs(combinedPrompt);
      setAudioUrl(url);
      setStatus("Audio generated successfully.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to send prompt to ElevenLabs");
    }
  }

  return (
    <main className="container-fluid py-3 composer-page">
      <div className="row g-3">
        <section className="col-12">
          <div className="card shadow-sm border-primary-subtle">
            <div className="card-body">
              <h1 className="h4 mb-3">Image Sound Composer</h1>
              <div className="row g-3 align-items-start">
                <div className="col-12 col-lg-8">
                  <label htmlFor="prompt-editor" className="form-label fw-semibold">
                    Selected image prompt
                  </label>
                  <textarea
                    id="prompt-editor"
                    className="form-control prompt-editor"
                    value={selectedItem?.prompt ?? ""}
                    onChange={(event) => onPromptChange(event.target.value)}
                    placeholder="Click an image to edit its prompt"
                  />
                  <p className="small mt-2 mb-0 text-body-secondary">
                    Composed prompt: {combinedPrompt || "(empty)"}
                  </p>
                </div>

                <div className="col-12 col-lg-4 d-grid gap-2">
                  <button className="btn btn-primary" onClick={onSendPrompt}>
                    Send Prompt To ElevenLabs
                  </button>
                  <button className="btn btn-outline-primary" onClick={openFilePicker}>
                    Add Images
                  </button>
                  {status && <div className="alert alert-info py-2 px-3 small mb-0">{status}</div>}
                  {audioUrl && <audio controls src={audioUrl} className="w-100" />}
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={(event) => {
                  onFilesPicked(event.target.files);
                  event.currentTarget.value = "";
                }}
                aria-label="Add images"
                className="d-none"
              />
            </div>
          </div>
        </section>

        <section className="col-12">
          <div className="card shadow-sm border-primary-subtle">
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
                      <img src={item.src} alt={item.name} />
                      <p className="emotion-tag">{item.analyzing ? "Analyzing..." : item.emotion}</p>
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
      </div>
    </main>
  );
}