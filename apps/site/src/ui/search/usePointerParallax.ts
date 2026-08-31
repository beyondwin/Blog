import { useEffect, type RefObject } from 'react';

const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

interface SaveDataConnection {
  readonly saveData?: boolean;
  addEventListener?(type: 'change', listener: () => void): void;
  removeEventListener?(type: 'change', listener: () => void): void;
}

function connectionForNavigator(): SaveDataConnection | undefined {
  return (navigator as Navigator & { connection?: SaveDataConnection }).connection;
}

function cap(value: number, limit: number) {
  return Math.max(-limit, Math.min(limit, value));
}

export function usePointerParallax(stageRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const finePointer = window.matchMedia(FINE_POINTER_QUERY);
    const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);
    const connection = connectionForNavigator();
    let frameId: number | null = null;
    let latestX = 0;
    let latestY = 0;
    let listening = false;
    let hasWrittenOffset = false;

    const canEnhance = () => finePointer.matches
      && !reducedMotion.matches
      && !connection?.saveData
      && !document.hidden;

    const clearFrame = () => {
      if (frameId === null) return;
      window.cancelAnimationFrame(frameId);
      frameId = null;
    };
    const reset = () => {
      clearFrame();
      if (!hasWrittenOffset) return;
      stage.style.setProperty('--look-x', '0px');
      stage.style.setProperty('--look-y', '0px');
      hasWrittenOffset = false;
    };
    const writeFrame = () => {
      frameId = null;
      if (!canEnhance()) {
        reset();
        return;
      }
      const bounds = stage.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const x = cap((((latestX - bounds.left) / bounds.width) - 0.5) * 16, 8);
      const y = cap((((latestY - bounds.top) / bounds.height) - 0.5) * 12, 6);
      stage.style.setProperty('--look-x', `${x}px`);
      stage.style.setProperty('--look-y', `${y}px`);
      hasWrittenOffset = true;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!canEnhance()) return;
      latestX = event.clientX;
      latestY = event.clientY;
      if (frameId === null) frameId = window.requestAnimationFrame(writeFrame);
    };
    const sync = () => {
      const shouldListen = canEnhance();
      if (shouldListen && !listening) {
        stage.addEventListener('pointermove', onPointerMove, { passive: true });
        listening = true;
      } else if (!shouldListen && listening) {
        stage.removeEventListener('pointermove', onPointerMove);
        listening = false;
      }
      if (!shouldListen) reset();
    };

    const onExit = () => reset();
    const onVisibilityChange = () => sync();
    sync();
    stage.addEventListener('pointerleave', onExit);
    window.addEventListener('blur', onExit);
    window.addEventListener('pageshow', onExit);
    document.addEventListener('visibilitychange', onVisibilityChange);
    finePointer.addEventListener('change', sync);
    reducedMotion.addEventListener('change', sync);
    connection?.addEventListener?.('change', sync);

    return () => {
      clearFrame();
      if (listening) stage.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerleave', onExit);
      window.removeEventListener('blur', onExit);
      window.removeEventListener('pageshow', onExit);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      finePointer.removeEventListener('change', sync);
      reducedMotion.removeEventListener('change', sync);
      connection?.removeEventListener?.('change', sync);
    };
  }, [stageRef]);
}
