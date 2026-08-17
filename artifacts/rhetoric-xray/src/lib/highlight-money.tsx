import type { ReactNode } from "react";

// Bolds monetary amounts inside law/case text pulled from 話術風險標籤資料庫
// (罰鍰/罰款/課徴金 figures) so the number that actually matters — "1,124萬元",
// "MOP20,000-60,000", "1,086萬日圓" — reads at a glance instead of being
// buried in a paragraph of legal prose. Currency-code amounts (NT$/HK$/S$/
// MOP/RM/...) and "<digits>[萬|億]?<currency word>[以上|以下]?" are covered;
// this is a rendering aid over free-text legal content, not a validator, so
// it intentionally errs toward matching too much rather than too little.
const MONEY_SOURCE =
  "(?:NT\\$|HK\\$|S\\$|A\\$|US\\$|MOP|RM|SGD|MYR)\\s?[\\d,]+(?:\\.\\d+)?(?:\\s?[-–~至]\\s?[\\d,]+(?:\\.\\d+)?)?" +
  "|[\\d,]+(?:\\.\\d+)?\\s?(?:萬|億)?\\s?(?:元|円|日圓|美元|新臺幣|台幣|港元|港幣|新加坡元|令吉|澳門元)(?:以上|以下)?";

const MONEY_SPLIT_REGEX = new RegExp(`(${MONEY_SOURCE})`, "g");

export function highlightMoney(text: string): ReactNode {
  if (!text) return text;
  const parts = text.split(MONEY_SPLIT_REGEX);
  if (parts.length === 1) return text;

  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-bold text-foreground">
        {part}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
