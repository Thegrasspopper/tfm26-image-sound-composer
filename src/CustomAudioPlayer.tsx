import { useEffect, useMemo, useRef, useState } from "react";

type CustomAudioPlayerProps = {
  src?: string;
  onDownload: () => void;
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export default function CustomAudioPlayer({ src, onDownload }: CustomAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const handleLoadedMetadata = () => setDuration(audio.duration || 0);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.pause();
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(audio.duration || 0);
  }, [src]);

  const hasAudio = Boolean(src);
  const safeDuration = useMemo(() => (duration > 0 ? duration : 0), [duration]);

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !hasAudio) {
      return;
    }
    if (audio.paused) {
      await audio.play();
      return;
    }
    audio.pause();
  }

  function handleSeek(nextTime: number) {
    const audio = audioRef.current;
    if (!audio || !hasAudio) {
      return;
    }
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function handleVolume(nextVolume: number) {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.volume = nextVolume;
    setVolume(nextVolume);
  }

  return (
    <div className="custom-player">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        className="btn btn-outline-primary btn-icon"
        onClick={() => {
          void togglePlay();
        }}
        disabled={!hasAudio}
        aria-label={isPlaying ? "Pause audio" : "Play audio"}
        title={isPlaying ? "Pause" : "Play"}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          {isPlaying ? "pause" : "play_arrow"}
        </span>
      </button>

      <span className="custom-player-time">{formatTime(currentTime)}</span>

      <input
        className="custom-player-seek"
        type="range"
        min={0}
        max={safeDuration || 0}
        step={0.1}
        value={Math.min(currentTime, safeDuration || 0)}
        onChange={(event) => handleSeek(Number(event.target.value))}
        disabled={!hasAudio}
        aria-label="Seek audio"
      />

      <span className="custom-player-time">{formatTime(safeDuration)}</span>

      <span className="material-symbols-outlined custom-player-volume-icon" aria-hidden="true">
        volume_up
      </span>
      <input
        className="custom-player-volume"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(event) => handleVolume(Number(event.target.value))}
        aria-label="Volume"
      />

      <button
        type="button"
        className="btn btn-outline-primary btn-icon"
        onClick={onDownload}
        disabled={!hasAudio}
        aria-label="Download audio"
        title="Download audio"
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          download
        </span>
      </button>
    </div>
  );
}
