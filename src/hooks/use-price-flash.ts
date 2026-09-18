import { useEffect, useRef, useState } from "react";

export type FlashDirection = "up" | "down" | null;

/**
 * Returns a transient direction flash whenever `value` changes.
 * Auto-resets to null after `duration` ms.
 */
export function usePriceFlash(value: number, duration = 600): FlashDirection {
  const prev = useRef<number>(value);
  const [dir, setDir] = useState<FlashDirection>(null);

  useEffect(() => {
    if (value === prev.current) return;
    setDir(value > prev.current ? "up" : "down");
    prev.current = value;
    const t = setTimeout(() => setDir(null), duration);
    return () => clearTimeout(t);
  }, [value, duration]);

  return dir;
}
