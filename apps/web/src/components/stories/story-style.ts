import { STORY_BACKGROUNDS, type StoryBackground } from "@werkraum/shared";

/** Schriftgrösse einer Text-Story relativ zur Bühnenbreite (cqw) – kurze Sätze gross, lange ruhiger. */
export function storyTextSize(text: string) {
  const n = text.length;
  if (n <= 40) return 8.6;
  if (n <= 110) return 6.8;
  if (n <= 220) return 5.4;
  if (n <= 360) return 4.6;
  return 4.1;
}

export function storyBackground(key: string | null | undefined) {
  return STORY_BACKGROUNDS[(key && key in STORY_BACKGROUNDS ? key : "coral") as StoryBackground];
}
