export type LoadingMotifId =
  | "bouncing-ball"
  | "passing-lane"
  | "kickoff-ripple"
  | "dribble"
  | "brand-pulse"
  | "pin-drop"
  | "message-stack"
  | "crowd-wave";

export type LoadingMotifFamily = "sport" | "brand" | "place" | "social";

export type LoadingMotif = {
  id: LoadingMotifId;
  family: LoadingMotifFamily;
  labelHe: string;
  labelEn: string;
  suggestedHe: string;
  suggestedEn: string;
};

export const LOADING_MOTIFS: LoadingMotif[];
export const LOADING_MOTIF_IDS: LoadingMotifId[];
export const LOADING_MOTIF_FAMILY_LABELS: Record<
  LoadingMotifFamily,
  { he: string; en: string }
>;
export function isLoadingMotifId(value: unknown): value is LoadingMotifId;
