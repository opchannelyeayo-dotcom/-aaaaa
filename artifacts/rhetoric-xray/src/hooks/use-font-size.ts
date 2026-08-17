import { useEffect, useState } from "react";

// Site-wide text size control — Tailwind's default scale is rem-based, so
// scaling the root element's font-size scales every rem-sized text on the
// page (headings, body copy, badges) together, without touching individual
// components. Persisted so the choice survives reloads/navigation — this
// matters for the site's actual audience (see footer: 守護長輩與家人的健康
// 消費防線), where a one-off larger-text preference is exactly the kind of
// thing that should stick, not reset every visit.
const STORAGE_KEY = "rhetoric-xray-font-size";
const DEFAULT_SIZE = "16";

export const FONT_SIZE_OPTIONS = [
  { value: "14", label: "小" },
  { value: "16", label: "標準" },
  { value: "18", label: "大" },
  { value: "20", label: "特大" },
] as const;

function readStoredSize(): string {
  if (typeof window === "undefined") return DEFAULT_SIZE;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return FONT_SIZE_OPTIONS.some((o) => o.value === stored) ? stored! : DEFAULT_SIZE;
}

export function useFontSize() {
  const [size, setSize] = useState(readStoredSize);

  useEffect(() => {
    document.documentElement.style.fontSize = `${size}px`;
    window.localStorage.setItem(STORAGE_KEY, size);
  }, [size]);

  return [size, setSize] as const;
}
