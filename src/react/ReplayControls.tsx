import { MAX_SPEED, MIN_SPEED } from "../replay/player";

export interface ReplayControlsProps {
  playing: boolean;
  /** Events shown, and events in all. */
  position: number;
  length: number;
  speed: number;
  onToggle: () => void;
  onSeek: (position: number) => void;
  onSpeed: (speed: number) => void;
}

const speeds = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64].filter((s) => s >= MIN_SPEED && s <= MAX_SPEED);

/** Play, pause, seek and speed for a replay. */
export function ReplayControls({ playing, position, length, speed, onToggle, onSeek, onSpeed }: ReplayControlsProps) {
  return (
    <div className="actlet-replay" role="group" aria-label="Replay">
      <button type="button" className="actlet-btn" onClick={onToggle} aria-label={playing ? "Pause" : "Play"}>
        {playing ? "❚❚" : "▶"}
      </button>
      <button
        type="button"
        className="actlet-btn"
        aria-label="Back one event"
        disabled={position === 0}
        onClick={() => onSeek(position - 1)}
      >
        ◀
      </button>
      <button
        type="button"
        className="actlet-btn"
        aria-label="Forward one event"
        disabled={position >= length}
        onClick={() => onSeek(position + 1)}
      >
        ▶▏
      </button>
      <input
        className="actlet-seek"
        type="range"
        min={0}
        max={length}
        value={position}
        aria-label="Position"
        aria-valuetext={`event ${position} of ${length}`}
        onChange={(e) => onSeek(Number(e.target.value))}
      />
      <span className="actlet-muted actlet-pos">{`${position}/${length}`}</span>
      <select
        className="actlet-speed"
        aria-label="Speed"
        value={speeds.includes(speed) ? speed : 1}
        onChange={(e) => onSpeed(Number(e.target.value))}
      >
        {speeds.map((s) => (
          <option key={s} value={s}>{`${s}x`}</option>
        ))}
      </select>
    </div>
  );
}
