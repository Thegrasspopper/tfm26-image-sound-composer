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

export function buildCombinedPrompt(prompts: string[]): string {
  const cleaned = prompts.map((item) => item.trim()).filter(Boolean);
  return cleaned.join(" | ");
}