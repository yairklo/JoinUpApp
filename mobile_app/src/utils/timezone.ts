import { tryParseJerusalemTimeToUTC } from '@joinup/shared/timezone';

export {
  formatJerusalemDate,
  formatJerusalemTime,
  parseJerusalemTimeToUTC,
  tryParseJerusalemTimeToUTC,
  jerusalemInstantToPickerDate,
  pickerToJerusalemUTC,
} from '@joinup/shared/timezone';

/** Game start as epoch ms (Jerusalem wall-clock date+time); 0 when the game has no parsable start. */
export function gameStartMs(game: { date?: string; time?: string }): number {
  return tryParseJerusalemTimeToUTC(game.date ?? '', game.time ?? '')?.getTime() ?? 0;
}
