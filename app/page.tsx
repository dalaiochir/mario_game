"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Status = "ready" | "playing" | "over";

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

/**
 * Simple SFX using WebAudio (no mp3 needed).
 * Note: iOS/Safari requires user gesture to start audio context.
 */
function createSfx() {
  const AudioCtx =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioCtx() as AudioContext;

  const beep = (freq: number, durationMs: number, type: OscillatorType, gain = 0.06) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();

    const t0 = ctx.currentTime;
    const t1 = t0 + durationMs / 1000;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t1);
    osc.stop(t1);
  };

  return {
    ctx,
    jump: () => beep(520, 90, "square", 0.045),
    coin: () => beep(880, 70, "triangle", 0.04),
    hit: () => beep(140, 200, "sawtooth", 0.07),
  };
}

export default function Page() {
  const [status, setStatus] = useState<Status>("ready");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [muted, setMuted] = useState(false);

  const gameRef = useRef<HTMLDivElement | null>(null);
  const marioRef = useRef<HTMLDivElement | null>(null);
  const pipeRef = useRef<HTMLDivElement | null>(null);

  // Physics state
  const y = useRef(0); // mario vertical offset (px), 0 = ground
  const vy = useRef(0); // velocity
  const pipeX = useRef(0);

  const raf = useRef<number | null>(null);
  const lastT = useRef<number>(0);
  const startedAt = useRef<number>(0);

  // SFX
  const sfx = useRef<ReturnType<typeof createSfx> | null>(null);
  const audioUnlocked = useRef(false);

  const speedPx = useMemo(() => {
    // base 420 px/s, increases with score (capped)
    return clamp(420 + score * 6, 420, 780);
  }, [score]);

  // Load best score from localStorage
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem("mario_best") || "0");
      setBest(Number.isFinite(v) ? v : 0);
    } catch {}
  }, []);

  const saveBest = (v: number) => {
    setBest(v);
    try {
      localStorage.setItem("mario_best", String(v));
    } catch {}
  };

  const ensureAudio = async () => {
    if (audioUnlocked.current) return;
    if (!sfx.current) sfx.current = createSfx();
    // resume after user gesture
    const ctx = sfx.current.ctx;
    if (ctx.state !== "running") {
      await ctx.resume().catch(() => {});
    }
    audioUnlocked.current = true;
  };

  const play = (name: "jump" | "coin" | "hit") => {
    if (muted) return;
    if (!sfx.current) return;
    sfx.current[name]?.();
  };

  const setMarioTransform = () => {
    const el = marioRef.current;
    if (!el) return;
    // Negative translateY to go up
    el.style.transform = `translateY(${-y.current}px) translateZ(0)`;
  };

  const setPipeTransform = () => {
    const el = pipeRef.current;
    if (!el) return;
    el.style.transform = `translateX(${pipeX.current}px) translateZ(0)`;
  };

  const resetWorld = () => {
    y.current = 0;
    vy.current = 0;
    pipeX.current = 0;
    setMarioTransform();
    setPipeTransform();
  };

  const start = () => {
    setScore(0);
    setStatus("playing");
    startedAt.current = performance.now();
    lastT.current = performance.now();
    resetWorld();
  };

  const restart = () => {
    setScore(0);
    setStatus("playing");
    startedAt.current = performance.now();
    lastT.current = performance.now();
    resetWorld();
  };

  const stop = () => {
    setStatus("over");
  };

  const doJump = async () => {
    if (status !== "playing") return;
    await ensureAudio();

    // If on ground -> jump
    if (y.current <= 0.001) {
      vy.current = 820; // jump impulse (px/s)
      play("jump");
    }
  };

  // Input: keyboard + pointer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        if (status === "ready") start();
        else if (status === "over") restart();
        else doJump();
      }
      if (e.code === "KeyM") {
        setMuted((m) => !m);
      }
      if (e.code === "Enter") {
        if (status === "ready") start();
        else if (status === "over") restart();
      }
    };
    window.addEventListener("keydown", onKey, { passive: false });
    return () => window.removeEventListener("keydown", onKey as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, muted]);

  // Main loop (smooth physics + smooth obstacle)
  useEffect(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;

    if (status !== "playing") return;

    const gravity = 2100; // px/s^2
    const groundY = 0;

    const loop = (t: number) => {
      const dt = clamp((t - lastT.current) / 1000, 0, 0.033); // cap 33ms
      lastT.current = t;

      // score by survival time (smooth)
      const elapsed = t - startedAt.current;
      const newScore = Math.floor(elapsed / 200);
      if (newScore !== score) setScore(newScore);

      // Mario physics
      vy.current -= gravity * dt;
      y.current += vy.current * dt;

      if (y.current <= groundY) {
        y.current = groundY;
        vy.current = 0;
      }
      setMarioTransform();

      // Pipe movement: start from right offscreen and move left
      const game = gameRef.current;
      const pipe = pipeRef.current;

      if (game && pipe) {
        const gw = game.clientWidth;

        // pipeX is relative translate from initial right:-80px
        // we move left by speedPx
        pipeX.current -= speedPx * dt;
        setPipeTransform();

        // when pipe passed far left -> reset to right (and bonus sfx)
        // rough reset threshold; depends on width
        if (pipe.getBoundingClientRect().right < game.getBoundingClientRect().left - 20) {
          pipeX.current = gw + 140; // respawn right
          setPipeTransform();
          // little "coin" tick every successful pass
          play("coin");
        }

        // Collision (AABB)
        const m = marioRef.current?.getBoundingClientRect();
        const p = pipe.getBoundingClientRect();

        if (m) {
          const margin = 6;
          const hit =
            m.right - margin > p.left &&
            m.left + margin < p.right &&
            m.bottom - margin > p.top &&
            m.top + margin < p.bottom;

          if (hit) {
            play("hit");
            const final = newScore;
            if (final > best) saveBest(final);
            stop();
            return;
          }
        }
      }

      raf.current = requestAnimationFrame(loop);
    };

    raf.current = requestAnimationFrame(loop);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, speedPx, muted, best, score]);

  return (
    <div className="shell">
      <div className="hud">
        <div className="pill">
          <b>Score:</b> <span>{score}</span>
          <span style={{ opacity: 0.6 }}>•</span>
          <b>Best:</b> <span>{best}</span>
          <span style={{ opacity: 0.6 }}>•</span>
          <span style={{ opacity: 0.85 }}>
            {status === "ready" && "Space/↑ (or Tap) to start"}
            {status === "playing" && "Space/↑, Tap, or Jump button"}
            {status === "over" && "Space/Enter (or button) to restart"}
          </span>
        </div>

        <div className="pill">
          <button
            className="ghost"
            onClick={async () => {
              await ensureAudio();
              setMuted((m) => !m);
            }}
            style={{ padding: "8px 10px", borderRadius: 12 }}
          >
            {muted ? "🔇 Muted (M)" : "🔊 Sound (M)"}
          </button>
        </div>
      </div>

      <div
        className="game"
        ref={gameRef}
        onPointerDown={async () => {
          // unlock audio on first interaction
          await ensureAudio();
          if (status === "ready") start();
          else if (status === "over") restart();
          else doJump();
        }}
      >
        <div className="cloud c1">
          <div className="base" />
        </div>
        <div className="cloud c2">
          <div className="base" />
        </div>
        <div className="cloud c3">
          <div className="base" />
        </div>

        <div
          ref={marioRef}
          className={`mario ${status === "playing" ? "run" : ""}`}
          aria-label="mario"
        >
          <div className="head" />
          <div className="face" />
          <div className="body" />
          <div className="leg l1" />
          <div className="leg l2" />
        </div>

        {/* Keep the same CSS pipe art; movement now via transform */}
        <div ref={pipeRef} className="pipe" />

        <div className="ground">
          <div className="tiles" />
        </div>

        {/* Mobile controls */}
        <div className="mobileControls">
          <button
            className="ctrlBtn"
            onPointerDown={async (e) => {
              e.preventDefault();
              await ensureAudio();
              if (status === "ready") start();
              else if (status === "over") restart();
              else doJump();
            }}
          >
            ⬆️ Jump <span className="ctrlHint">(Tap)</span>
          </button>

          <button
            className="ctrlBtn"
            onPointerDown={async (e) => {
              e.preventDefault();
              await ensureAudio();
              setMuted((m) => !m);
            }}
          >
            {muted ? "🔇" : "🔊"} <span className="ctrlHint">Sound</span>
          </button>
        </div>

        {status !== "playing" && (
          <div className="overlay">
            <div className="card">
              <h2>{status === "ready" ? "Mario CSS Runner" : "Game Over"}</h2>
              <p>
                {status === "ready"
                  ? "Start дараад, саадаас smooth үсэрч зайл."
                  : `Таны оноо: ${score}. Best: ${best}.`}
              </p>
              <div className="btns">
                <button
                  className="primary"
                  onClick={async () => {
                    await ensureAudio();
                    status === "ready" ? start() : restart();
                  }}
                >
                  {status === "ready" ? "Start" : "Restart"}
                </button>
                <button className="ghost" onClick={() => setStatus("ready")}>
                  Reset
                </button>
              </div>
              <div className="note">
                Tip: Space/↑, дэлгэц дээр tap, эсвэл Jump товч.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}