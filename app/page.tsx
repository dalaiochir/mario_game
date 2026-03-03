"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Status = "ready" | "playing" | "over";

export default function Page() {
  const [status, setStatus] = useState<Status>("ready");
  const [score, setScore] = useState(0);

  const gameRef = useRef<HTMLDivElement | null>(null);
  const marioRef = useRef<HTMLDivElement | null>(null);
  const pipeRef = useRef<HTMLDivElement | null>(null);

  const jumpLock = useRef(false);
  const raf = useRef<number | null>(null);
  const startedAt = useRef<number>(0);

  const speedMs = useMemo(() => {
    // оноо өсөхөөр бага зэрэг хурд нэмэгдүүлнэ (min 1100ms)
    const s = Math.max(1100, 1600 - Math.floor(score / 10) * 80);
    return s;
  }, [score]);

  const doJump = () => {
    if (status !== "playing") return;
    if (jumpLock.current) return;
    jumpLock.current = true;

    const mario = marioRef.current;
    if (!mario) return;

    mario.classList.add("jump");
    window.setTimeout(() => {
      mario.classList.remove("jump");
      jumpLock.current = false;
    }, 520);
  };

  const start = () => {
    setScore(0);
    setStatus("playing");
    startedAt.current = performance.now();

    const pipe = pipeRef.current;
    if (pipe) {
      pipe.style.setProperty("--speed", `${speedMs}ms`);
      pipe.classList.add("move");
    }
  };

  const restart = () => {
    const pipe = pipeRef.current;
    if (pipe) {
      pipe.classList.remove("move");
      // reset animation by forcing reflow
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      pipe.offsetHeight;
      pipe.style.setProperty("--speed", `${1600}ms`);
      pipe.classList.add("move");
    }
    setScore(0);
    setStatus("playing");
    startedAt.current = performance.now();
  };

  const stop = () => {
    setStatus("over");
    const pipe = pipeRef.current;
    pipe?.classList.remove("move");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        if (status === "ready") start();
        else if (status === "over") restart();
        else doJump();
      }
      if (e.code === "Enter") {
        if (status === "ready") start();
        else if (status === "over") restart();
      }
    };
    window.addEventListener("keydown", onKey, { passive: false });
    return () => window.removeEventListener("keydown", onKey as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, speedMs]);

  // Score + collision loop
  useEffect(() => {
    if (status !== "playing") {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
      return;
    }

    const loop = () => {
      const mario = marioRef.current;
      const pipe = pipeRef.current;
      const game = gameRef.current;

      if (mario && pipe && game) {
        // score by time survived
        const t = performance.now() - startedAt.current;
        setScore(Math.floor(t / 200));

        const m = mario.getBoundingClientRect();
        const p = pipe.getBoundingClientRect();

        // Simple AABB collision with a small forgiveness margin
        const margin = 6;
        const hit =
          m.right - margin > p.left &&
          m.left + margin < p.right &&
          m.bottom - margin > p.top &&
          m.top + margin < p.bottom;

        if (hit) {
          stop();
          return;
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
  }, [status]);

  // Keep speed synced (when score changes)
  useEffect(() => {
    const pipe = pipeRef.current;
    if (!pipe) return;
    pipe.style.setProperty("--speed", `${speedMs}ms`);
  }, [speedMs]);

  return (
    <div className="shell">
      <div className="hud">
        <div className="pill">
          <b>Score:</b> <span>{score}</span>
          <span style={{ opacity: 0.6 }}>•</span>
          <span style={{ opacity: 0.85 }}>
            {status === "ready" && "Press Space to start"}
            {status === "playing" && "Space/↑ to jump"}
            {status === "over" && "Space/Enter to restart"}
          </span>
        </div>

        <div className="pill">
          <b>Speed:</b> <span>{Math.round(1600 / speedMs * 100)}%</span>
        </div>
      </div>

      <div
        className="game"
        ref={gameRef}
        onPointerDown={() => {
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

        <div ref={pipeRef} className={`pipe ${status === "playing" ? "move" : ""}`} />

        <div className="ground">
          <div className="tiles" />
        </div>

        {status !== "playing" && (
          <div className="overlay">
            <div className="card">
              <h2>
                {status === "ready" ? "Mario CSS Runner" : "Game Over"}
              </h2>
              <p>
                {status === "ready"
                  ? "Space/↑ дарж эхлүүлээд, саадаас үсэрч зайл."
                  : `Таны оноо: ${score}. Дахин тоглох уу?`}
              </p>
              <div className="btns">
                <button
                  className="primary"
                  onClick={() => (status === "ready" ? start() : restart())}
                >
                  {status === "ready" ? "Start" : "Restart"}
                </button>
                <button className="ghost" onClick={() => setStatus("ready")}>
                  Reset
                </button>
              </div>
              <div className="note">Tip: Mouse/Touch дээр тоглох бол дэлгэц дээр дарж үсэрнэ.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}