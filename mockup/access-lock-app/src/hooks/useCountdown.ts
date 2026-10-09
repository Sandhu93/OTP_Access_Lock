import { useEffect, useRef, useState } from 'react';

/**
 * Counts down from `initialSeconds` to 0, ticking once per second.
 * Returns the remaining seconds and a formatted mm:ss label.
 * Purely presentational — the real expiry is enforced server-side;
 * this only drives the on-screen countdown.
 */
export function useCountdown(initialSeconds: number, onExpire?: () => void) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const firedRef = useRef(false);

  useEffect(() => {
    if (secondsLeft <= 0) {
      if (!firedRef.current) {
        firedRef.current = true;
        onExpire?.();
      }
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, onExpire]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return { secondsLeft, label: `${mm}:${ss}` };
}

/** Counts up — used for the "Scanning… 00:04" indicator. */
export function useStopwatch() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return { seconds, label: `${mm}:${ss}` };
}
