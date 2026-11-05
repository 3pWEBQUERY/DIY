/** Browser aus dem User-Agent bestimmen (Reihenfolge wichtig: Edge/Opera/… enthalten „Chrome“). */
export function browserFromUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  if (/Werk(?:raum|uno)App/.test(ua)) return "app";
  if (/Edg(?:e|A|iOS)?\//.test(ua)) return "edge";
  if (/OPR\/|Opera|OPiOS/.test(ua)) return "opera";
  if (/Vivaldi/.test(ua)) return "vivaldi";
  if (/Brave/.test(ua)) return "brave";
  if (/DuckDuckGo|Ddg\//.test(ua)) return "duckduckgo";
  if (/Firefox\/|FxiOS/.test(ua)) return "firefox";
  if (/Chrome\/|CriOS|Chromium/.test(ua)) return "chrome";
  if (/Safari\//.test(ua)) return "safari";
  return null;
}
