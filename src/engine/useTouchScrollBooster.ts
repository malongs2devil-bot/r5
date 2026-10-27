import { useEffect, useRef } from 'react';

/**
 * Universal Mobile & Desktop Touch/Drag Scroll Engine for `.touch-scroll-y` and `.touch-scroll-x`.
 * Solves mobile touch scrolling across:
 *  1. Portrait smartphones auto-rotated 90deg via CSS (`.landscape-shell-rotated`)
 *  2. Proportional virtual-canvas scaling (`transform: scale(uiScale)`)
 *  3. Nested scroll containers (inner slot list -> outer modal grid scroll chaining)
 *  4. Inertial flick momentum coasting while preserving instant taps on buttons & file `<label>`s.
 */
export function useTouchScrollBooster(isRotatedPortrait: boolean, uiScale: number) {
  const configRef = useRef({ isRotatedPortrait, uiScale });
  configRef.current = { isRotatedPortrait, uiScale: Math.max(0.35, uiScale || 1) };

  useEffect(() => {
    let activePointerId: number | null = null;
    let lastClientX = 0;
    let lastClientY = 0;
    let lastMoveTime = 0;
    let totalTravel = 0;
    let didDrag = false;
    let velX = 0;
    let velY = 0;
    let scrollYChain: HTMLElement[] = [];
    let scrollXChain: HTMLElement[] = [];
    let momentumRaf = 0;
    let suppressClickUntil = 0;

    const cancelMomentum = () => {
      if (momentumRaf) {
        cancelAnimationFrame(momentumRaf);
        momentumRaf = 0;
      }
    };

    const collectScrollChains = (startNode: EventTarget | null) => {
      const yChain: HTMLElement[] = [];
      const xChain: HTMLElement[] = [];
      let cur = startNode instanceof HTMLElement ? startNode : null;
      while (cur && cur !== document.body) {
        if (cur.classList.contains('touch-scroll-y') && cur.scrollHeight > cur.clientHeight + 1) {
          yChain.push(cur);
        }
        if (cur.classList.contains('touch-scroll-x') && cur.scrollWidth > cur.clientWidth + 1) {
          xChain.push(cur);
        }
        cur = cur.parentElement;
      }
      return { yChain, xChain };
    };

    const applyChainedScrollY = (chain: HTMLElement[], deltaScrollTop: number): boolean => {
      let remaining = deltaScrollTop;
      let moved = false;
      for (let i = 0; i < chain.length; i++) {
        if (Math.abs(remaining) < 0.2) break;
        const el = chain[i];
        const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
        if (maxTop <= 0) continue;
        const prev = el.scrollTop;
        const next = Math.max(0, Math.min(maxTop, prev + remaining));
        const consumed = next - prev;
        if (Math.abs(consumed) > 0.05) {
          el.scrollTop = next;
          remaining -= consumed;
          moved = true;
        }
      }
      return moved;
    };

    const applyChainedScrollX = (chain: HTMLElement[], deltaScrollLeft: number): boolean => {
      let remaining = deltaScrollLeft;
      let moved = false;
      for (let i = 0; i < chain.length; i++) {
        if (Math.abs(remaining) < 0.2) break;
        const el = chain[i];
        const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
        if (maxLeft <= 0) continue;
        const prev = el.scrollLeft;
        const next = Math.max(0, Math.min(maxLeft, prev + remaining));
        const consumed = next - prev;
        if (Math.abs(consumed) > 0.05) {
          el.scrollLeft = next;
          remaining -= consumed;
          moved = true;
        }
      }
      return moved;
    };

    const toLogicalDelta = (rawDx: number, rawDy: number) => {
      const { isRotatedPortrait: rot, uiScale: scale } = configRef.current;
      if (rot) {
        // Inside rotate(90deg): visual +X is physical +Y; visual +Y is physical -X
        return {
          dx: rawDy / scale,
          dy: -rawDx / scale,
        };
      }
      return {
        dx: rawDx / scale,
        dy: rawDy / scale,
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Never hijack interactive range sliders, text fields, or 3D canvases
      if (
        target.closest(
          'input[type="range"], input[type="text"], input[type="password"], input[type="number"], textarea, select, canvas'
        )
      ) {
        return;
      }

      const { yChain, xChain } = collectScrollChains(target);
      if (yChain.length === 0 && xChain.length === 0) return;

      cancelMomentum();
      activePointerId = e.pointerId;
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      lastMoveTime = performance.now();
      totalTravel = 0;
      didDrag = false;
      velX = 0;
      velY = 0;
      scrollYChain = yChain;
      scrollXChain = xChain;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (activePointerId === null || e.pointerId !== activePointerId) return;

      const now = performance.now();
      const dt = Math.max(0.004, Math.min(0.08, (now - lastMoveTime) / 1000));
      const rawDx = e.clientX - lastClientX;
      const rawDy = e.clientY - lastClientY;
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      lastMoveTime = now;

      const { dx, dy } = toLogicalDelta(rawDx, rawDy);
      totalTravel += Math.hypot(dx, dy);

      if (!didDrag && totalTravel > 7) {
        didDrag = true;
      }

      if (didDrag) {
        if (scrollYChain.length > 0 && Math.abs(dy) > 0.05) {
          applyChainedScrollY(scrollYChain, -dy);
        }
        if (scrollXChain.length > 0 && Math.abs(dx) > 0.05) {
          applyChainedScrollX(scrollXChain, -dx);
        }

        const instVx = -dx / dt;
        const instVy = -dy / dt;
        velX = velX * 0.35 + instVx * 0.65;
        velY = velY * 0.35 + instVy * 0.65;
      }
    };

    const finishPointer = (e: PointerEvent) => {
      if (activePointerId === null || e.pointerId !== activePointerId) return;
      activePointerId = null;

      const idleGapMs = performance.now() - lastMoveTime;
      const launchVx = idleGapMs > 90 ? 0 : velX;
      const launchVy = idleGapMs > 90 ? 0 : velY;
      const yChainSnap = scrollYChain;
      const xChainSnap = scrollXChain;

      if (didDrag) {
        suppressClickUntil = performance.now() + 140;
      }
      didDrag = false;

      if (Math.hypot(launchVx, launchVy) > 85) {
        let curVx = Math.max(-2600, Math.min(2600, launchVx));
        let curVy = Math.max(-2600, Math.min(2600, launchVy));
        let prevTick = performance.now();

        const stepMomentum = () => {
          const now = performance.now();
          const dt = Math.min(0.05, Math.max(0.004, (now - prevTick) / 1000));
          prevTick = now;

          let anyMoved = false;
          if (yChainSnap.length > 0 && Math.abs(curVy) > 12) {
            if (applyChainedScrollY(yChainSnap, curVy * dt)) anyMoved = true;
          }
          if (xChainSnap.length > 0 && Math.abs(curVx) > 12) {
            if (applyChainedScrollX(xChainSnap, curVx * dt)) anyMoved = true;
          }

          const decay = Math.exp(-4.4 * dt);
          curVx *= decay;
          curVy *= decay;

          if (anyMoved && Math.hypot(curVx, curVy) > 16) {
            momentumRaf = requestAnimationFrame(stepMomentum);
          } else {
            momentumRaf = 0;
          }
        };

        momentumRaf = requestAnimationFrame(stepMomentum);
      }
    };

    const onCaptureClick = (e: MouseEvent) => {
      if (performance.now() < suppressClickUntil) {
        e.preventDefault();
        e.stopPropagation();
        suppressClickUntil = 0;
      }
    };

    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', finishPointer, { passive: true });
    window.addEventListener('pointercancel', finishPointer, { passive: true });
    window.addEventListener('click', onCaptureClick, true);

    return () => {
      cancelMomentum();
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finishPointer);
      window.removeEventListener('pointercancel', finishPointer);
      window.removeEventListener('click', onCaptureClick, true);
    };
  }, []);
}
