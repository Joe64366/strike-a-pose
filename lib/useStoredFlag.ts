"use client";

import { useCallback, useEffect, useState, type SetStateAction } from "react";

/** A boolean preference remembered in localStorage (falls back gracefully). */
export function useStoredFlag(key: string, initial: boolean) {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw !== null) setValue(raw === "1");
    } catch {}
  }, [key]);

  const set = useCallback(
    (next: SetStateAction<boolean>) => {
      setValue((prev) => {
        const v = typeof next === "function" ? next(prev) : next;
        try {
          localStorage.setItem(key, v ? "1" : "0");
        } catch {}
        return v;
      });
    },
    [key],
  );

  return [value, set] as const;
}
