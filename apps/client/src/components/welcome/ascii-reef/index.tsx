import { memo, useEffect, useRef } from 'react';
import {
  FONT_STACK,
  FRAME_INTERVAL_MS,
  LINE_HEIGHT,
  fontSizeForWidth
} from './config';
import {
  drawScene,
  measureCharWidth,
  renderStatic,
  updateScene,
  type Metrics
} from './engine';
import { createRng, randomSeed, type Rng } from './rng';
import { generateScene } from './scene';
import type { Scene } from './types';

/**
 * Procedural ASCII reef backdrop for the Welcome screen (see
 * docs/superpowers/specs/2026-07-01-ascii-reef-background-design.md).
 *
 * A single canvas: static layers are cached offscreen and blitted; the moving
 * layers are drawn per frame at ~30fps. Purely decorative — aria-hidden, no
 * pointer/selection, behind content. Pauses while backgrounded and renders a
 * single static frame when the user prefers reduced motion.
 */

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const AsciiReefBackdrop = memo(() => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;

    if (!wrapper || !canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return;
    }

    const reduced = prefersReducedMotion();

    let scene: Scene | null = null;
    let staticCache: HTMLCanvasElement | null = null;
    let metrics: Metrics | null = null;
    let rng: Rng = createRng(randomSeed());
    let cssW = 0;
    let cssH = 0;
    let raf = 0;
    let last = 0;
    let time = 0;
    let stopped = false;

    const build = () => {
      const rect = wrapper.getBoundingClientRect();
      cssW = Math.max(1, Math.floor(rect.width));
      cssH = Math.max(1, Math.floor(rect.height));

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const fontSize = fontSizeForWidth(cssW);
      const charW = measureCharWidth(ctx, fontSize) || fontSize * 0.6;
      const cellH = fontSize * LINE_HEIGHT;
      metrics = { charW, cellH, fontSize, dpr };

      canvas.width = Math.ceil(cssW * dpr);
      canvas.height = Math.ceil(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cols = Math.max(8, Math.floor(cssW / charW));
      const rows = Math.max(8, Math.floor(cssH / cellH));

      rng = createRng(randomSeed());
      scene = generateScene(cols, rows, rng);
      staticCache = renderStatic(scene, metrics, cssW, cssH);
      time = 0;
      last = 0;

      drawScene(ctx, scene, metrics, staticCache, cssW, cssH, time);
    };

    const loop = (now: number) => {
      if (stopped) {
        return;
      }

      raf = requestAnimationFrame(loop);

      if (!scene || !metrics || !staticCache) {
        return;
      }

      if (!last) {
        last = now;
        return;
      }

      const elapsed = now - last;
      if (elapsed < FRAME_INTERVAL_MS) {
        return;
      }

      const dt = Math.min(elapsed / 1000, 0.1);
      last = now;
      time += dt;

      updateScene(scene, dt, rng);
      drawScene(ctx, scene, metrics, staticCache, cssW, cssH, time);
    };

    const start = () => {
      if (reduced || stopped) {
        return;
      }
      cancelAnimationFrame(raf);
      last = 0;
      raf = requestAnimationFrame(loop);
    };

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        start();
      }
    };

    // Regenerate (not stretch) when the container size actually changes.
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      const rect = wrapper.getBoundingClientRect();
      if (Math.abs(rect.width - cssW) < 2 && Math.abs(rect.height - cssH) < 2) {
        return;
      }
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        build();
        start();
      }, 200);
    });

    build();
    start();
    observer.observe(wrapper);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 select-none overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        style={{ fontFamily: FONT_STACK }}
      />
    </div>
  );
});

export { AsciiReefBackdrop };
