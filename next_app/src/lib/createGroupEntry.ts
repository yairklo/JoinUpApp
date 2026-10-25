// The "create a recurring group" entry point on /games/new. Groups are created from an existing
// game (SeriesManager's "צור קבוצה" dialog on the game page), so the group mode of the create-game
// page creates the first game as usual and then lands on it with that dialog already open.
export type CreateMode = "single" | "group";

export const CREATE_GROUP_PARAM = "createGroup";

export function parseCreateMode(value: string | null | undefined): CreateMode {
  return value === "group" ? "group" : "single";
}

export function postCreateGamePath(gameId: string, mode: CreateMode): string {
  return mode === "group" ? `/games/${gameId}?${CREATE_GROUP_PARAM}=1` : `/games/${gameId}`;
}
