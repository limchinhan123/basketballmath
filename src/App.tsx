import { useEffect, useRef, useState } from 'react';
import { createMathBasketballGame } from './game/createMathBasketballGame';
import type { BallColor, PlayerMode } from './game/types';

const playerLabels: Record<PlayerMode, string> = {
  pair: 'Both',
  rae: 'Rae',
  zoe: 'Zoe',
};

const ballColors: Array<{ id: BallColor; label: string }> = [
  { id: 'pink', label: 'Pink' },
  { id: 'orange', label: 'Orange' },
  { id: 'yellow', label: 'Yellow' },
];

export function App() {
  const gameHostRef = useRef<HTMLDivElement | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playerMode, setPlayerMode] = useState<PlayerMode>('pair');
  const [ballColor, setBallColor] = useState<BallColor>('pink');

  useEffect(() => {
    if (!gameHostRef.current) return;
    const game = createMathBasketballGame(gameHostRef.current);
    const pausedHandler = (event: Event) => {
      setIsPaused(Boolean((event as CustomEvent<{ paused: boolean }>).detail.paused));
    };

    window.addEventListener('mbg:pause-state', pausedHandler);
    return () => {
      window.removeEventListener('mbg:pause-state', pausedHandler);
      game.destroy(true);
    };
  }, []);

  const send = (name: string, detail?: unknown) => {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  };

  const requestMobileFullscreen = () => {
    const isTouchLandscape = window.matchMedia('(orientation: landscape)').matches
      && (navigator.maxTouchPoints > 0 || window.innerHeight <= 540);
    if (!isTouchLandscape || document.fullscreenElement) return;

    const root = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    const request = root.requestFullscreen ?? root.webkitRequestFullscreen;
    void request?.call(root)?.catch?.(() => undefined);
  };

  return (
    <main className="app-shell">
      <section
        className="game-stage"
        aria-label="Math Basketball"
        onPointerDown={requestMobileFullscreen}
      >
        <div ref={gameHostRef} className="game-host" />
        <div className="portrait-hint" aria-hidden="true">
          <strong>Turn sideways</strong>
          <span>Landscape works best for little thumbs.</span>
        </div>
        <aside className="parent-panel" aria-label="Parent controls">
          <fieldset className="player-picker">
            <span>Players</span>
            <div className="player-options">
              {(Object.keys(playerLabels) as PlayerMode[]).map((mode) => (
                <button
                  key={mode}
                  className={`player-option ${playerMode === mode ? 'active' : ''}`}
                  type="button"
                  aria-label={`${mode === 'pair' ? 'Rae and Zoe' : playerLabels[mode]} player mode`}
                  aria-pressed={playerMode === mode}
                  onClick={(event) => {
                    setPlayerMode(mode);
                    setIsPaused(false);
                    send('mbg:set-player-mode', { mode });
                    event.currentTarget.blur();
                  }}
                >
                  {playerLabels[mode]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="ball-picker">
            <legend>Ball color</legend>
            <div className="ball-options">
              {ballColors.map((option) => (
                <button
                  key={option.id}
                  className={`ball-swatch ${option.id} ${ballColor === option.id ? 'active' : ''}`}
                  type="button"
                  aria-label={`${option.label} basketball`}
                  aria-pressed={ballColor === option.id}
                  onClick={(event) => {
                    setBallColor(option.id);
                    send('mbg:set-ball-color', { color: option.id });
                    event.currentTarget.blur();
                  }}
                />
              ))}
            </div>
          </fieldset>

          <button
            className="panel-button"
            type="button"
            onClick={(event) => {
              send('mbg:toggle-pause');
              event.currentTarget.blur();
            }}
          >
            {isPaused ? 'Resume' : 'Pause'} <span>P</span>
          </button>

          <button
            className="panel-button reset-button"
            type="button"
            onClick={(event) => {
              setIsPaused(false);
              send('mbg:reset-game');
              event.currentTarget.blur();
            }}
          >
            Stop & Reset
          </button>

          <button
            className="panel-button"
            type="button"
            onClick={(event) => {
              const next = !isMuted;
              setIsMuted(next);
              send('mbg:set-muted', { muted: next });
              event.currentTarget.blur();
            }}
          >
            {isMuted ? 'Sound On' : 'Mute'}
          </button>
        </aside>
      </section>
    </main>
  );
}
