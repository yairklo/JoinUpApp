export {
  SPORT_MAPPING,
  SPORT_EMOJI,
  POSITION_OPTIONS,
} from '@joinup/shared/sports';

export const SPORT_IMAGES = {
    SOCCER: "/images/soccer.jpg",
    BASKETBALL: "/images/basketball.jpg",
    TENNIS: "/images/tennis.jpg"
};

export type SportType = keyof typeof SPORT_IMAGES;
export type SportFilter = SportType | "ALL";
