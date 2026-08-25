import { GifFile } from './gif.model';

export interface Playlist {
  id: string;
  name: string;
  randomize: boolean;
  durationSeconds: number;
  gifs: GifFile[];
}

export const PLAYLIST_DURATION_OPTIONS = [3, 5, 10] as const;

/** WLED preset slots reserved for this app (inclusive). */
export const PRESET_PREFIX = 'gifpl-';
export const PRESET_SLOT_START = 150;
export const PRESET_SLOT_END = 250;
export const MAX_PLAYLIST_GIFS = PRESET_SLOT_END - PRESET_SLOT_START + 1;
