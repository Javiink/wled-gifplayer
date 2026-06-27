import { GifFile } from './gif.model';

export interface Playlist {
  id: string;
  name: string;
  randomize: boolean;
  durationSeconds: number;
  gifs: GifFile[];
}

export const PLAYLIST_DURATION_OPTIONS = [3, 5, 10] as const;
