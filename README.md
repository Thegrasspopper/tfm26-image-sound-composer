# Image Sound Composer

A TypeScript + React app where users:

- Upload images.
- See them in a horizontal sequence with emotion tags.
- Drag images to change order.
- Click an image to edit its prompt in a top-left panel.
- Send the composed prompt to ElevenLabs.

## Setup

1. Install dependencies:

   npm install

2. Copy env file and fill keys:

   copy .env.example .env

3. Run:

   npm run dev

## Environment variables

- `VITE_GEMINI_API_KEY`
- `VITE_GEMINI_MODEL` (default: `gemini-1.5-flash`)
- `VITE_ELEVENLABS_API_KEY`
- `VITE_ELEVENLABS_MODEL` (default: `eleven_multilingual_v2`)

## Notes

- Gemini analysis uses the uploaded image data and requests JSON with an `emotion` field.
- ElevenLabs endpoint currently uses a fixed voice id (`JBFqnCBsd6RMkjVDRZzb`) to return an audio preview URL.