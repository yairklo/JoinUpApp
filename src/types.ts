export interface Participant {
  id: string;
  name: string;
  avatar?: string;
}

export type FieldType = 'open' | 'closed';

export interface Field {
  id: string;
  name: string;
  location: string;
  price: number;
  rating: number;
  image: string;
  available: boolean;
  type: FieldType;
  games: Game[];
}

export interface Game {
  id: string;
  fieldId: string;
  fieldName: string;
  fieldLocation: string;
  fieldType: FieldType;
  date: string;
  time: string;
  duration: number;
  maxPlayers: number;
  currentPlayers: number;
  skillLevel: 'Beginner' | 'Intermediate' | 'Advanced' | 'Mixed';
  ageGroup: 'Youth' | 'Adult' | 'Senior' | 'Mixed';
  isOpenToJoin: boolean;
  description: string;
  organizer: string;
  price: number;
  participants: Participant[];
}

export interface SearchFilters {
  location: string;
  priceRange: string;
  date: string;
  time: string;
  skillLevel: string;
  ageGroup: string;
  fieldType: string;
} 