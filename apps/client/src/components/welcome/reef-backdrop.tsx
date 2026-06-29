import { memo, useEffect, useRef } from 'react';

/**
 * Decorative backdrop for the welcome screen: a subtle gray coral-reef
 * silhouette along the bottom and a shark that swims across at random intervals.
 * Purely cosmetic (aria-hidden, pointer-events-none, behind content). Respects
 * prefers-reduced-motion and pauses while the tab/app is backgrounded.
 */

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const rand = (min: number, max: number) => min + Math.random() * (max - min);

const ReefBackdrop = memo(() => {
  const sharkRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const shark = sharkRef.current;

    if (!shark || prefersReducedMotion()) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let anim: Animation | null = null;
    let stopped = false;

    const runPass = () => {
      if (stopped) {
        return;
      }

      const vw = window.innerWidth;
      const leftToRight = Math.random() > 0.5;
      const duration = rand(16000, 30000);
      const depth = rand(-20, 70); // vertical jitter around the base position
      const scale = rand(0.7, 1.15);
      const tilt = rand(-4, 4);
      const fromX = leftToRight ? -200 : vw + 200;
      const toX = leftToRight ? vw + 200 : -200;
      const flip = leftToRight ? '' : ' scaleX(-1)';

      shark.style.opacity = '0.9';
      anim = shark.animate(
        [
          {
            transform: `translate(${fromX}px, ${depth}px) scale(${scale})${flip} rotate(${tilt}deg)`
          },
          {
            transform: `translate(${toX}px, ${depth}px) scale(${scale})${flip} rotate(${tilt}deg)`
          }
        ],
        { duration, easing: 'linear' }
      );

      anim.onfinish = () => {
        shark.style.opacity = '0';
        timer = setTimeout(runPass, rand(20000, 60000));
      };
    };

    const onVisibility = () => {
      if (!anim) {
        return;
      }

      if (document.hidden) {
        anim.pause();
      } else if (anim.playState === 'paused') {
        anim.play();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    timer = setTimeout(runPass, rand(2500, 6000));

    return () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
      anim?.cancel();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {/* Shark — positioned at the left edge and moved via Web Animations. */}
      <svg
        ref={sharkRef}
        width="96"
        height="48"
        viewBox="-90 -45 190 90"
        className="absolute left-0 top-[62%]"
        style={{ opacity: 0, color: '#d7e0e6', willChange: 'transform' }}
        fill="currentColor"
      >
        <path d="M 90 0 C 60 -14, 20 -20, -20 -16 C -40 -13, -54 -10, -60 -7 L -80 -30 C -73 -16, -70 -6, -70 0 C -70 6, -73 16, -80 30 L -60 7 C -54 10, -40 13, -20 16 C 20 20, 60 14, 90 0 Z" />
        <path d="M 4 -16 L 20 -44 L 35 -15 Z" />
        <path d="M 22 12 L 42 34 L 50 13 Z" />
        <circle cx="62" cy="-3" r="2.6" fill="#141b21" />
      </svg>

      {/* Coral reef silhouette along the bottom (gray, stretched full width). */}
      <svg
        className="absolute bottom-0 left-0 w-full"
        height="180"
        viewBox="0 0 1200 200"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="reef-back" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3f4851" />
            <stop offset="100%" stopColor="#2a3138" />
          </linearGradient>
          <linearGradient id="reef-front" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5a6571" />
            <stop offset="100%" stopColor="#3a434c" />
          </linearGradient>
        </defs>

        {/* back layer */}
        <path
          fill="url(#reef-back)"
          opacity="0.5"
          d="M0 200 L0 120 Q60 92 110 116 Q150 78 200 114 Q250 92 300 118 Q360 84 420 120 Q470 96 520 122 Q590 86 650 120 Q710 94 770 122 Q840 84 900 120 Q960 96 1020 122 Q1080 88 1140 118 Q1175 104 1200 120 L1200 200 Z"
        />

        {/* branching coral sprigs (drawn behind the front layer's lip) */}
        <g
          fill="none"
          stroke="#4a545e"
          strokeWidth="7"
          strokeLinecap="round"
          opacity="0.6"
        >
          <path d="M 430 150 q -4 -42 -22 -56 q -16 -12 -10 -30 m 32 86 q 6 -40 26 -52 q 14 -8 12 -26 m -32 78 q 0 -30 2 -50" />
          <path d="M 1080 150 q -6 -46 -26 -60 m 26 60 q 8 -42 30 -54 m -30 54 q 1 -34 2 -56" />
        </g>

        {/* front layer */}
        <path
          fill="url(#reef-front)"
          opacity="0.7"
          d="M0 200 L0 150 Q70 124 130 148 Q180 112 240 146 Q300 124 360 150 Q430 110 500 148 Q560 124 620 150 Q700 112 760 148 Q830 124 900 150 Q970 116 1040 148 Q1110 126 1160 150 Q1185 140 1200 150 L1200 200 Z"
        />

        {/* brain-coral bumps + faint rim light */}
        <g fill="url(#reef-front)" opacity="0.7">
          <ellipse cx="120" cy="150" rx="30" ry="22" />
          <ellipse cx="680" cy="154" rx="26" ry="20" />
        </g>
        <g fill="none" stroke="#8a95a0" strokeWidth="2" opacity="0.25">
          <path d="M 96 140 q 24 -16 48 0" />
          <path d="M 660 144 q 20 -14 40 0" />
        </g>
      </svg>
    </div>
  );
});

export { ReefBackdrop };
