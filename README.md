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

- `GEMINI_API_KEY`
- `GEMINI_MODEL` (default: `gemini-2.5-flash`)
- `CLAUDE_API_KEY`
- `CLAUDE_MODEL` (default: `claude-haiku-4-5`)
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_MUSIC_MODEL` (default: `music_v1`)

## Notes

- You can analyze images with Gemini or Claude Haiku 4.5 (select in UI), both returning VAD + style JSON.
- ElevenLabs uses the official JS SDK music compose API with a section-based composition plan.



I want to have a floating panel on the right side, with the general prompt as label tags. I also want to have the current selected image has a smaller image with the prompts also as labels

Use material design google icons for icons