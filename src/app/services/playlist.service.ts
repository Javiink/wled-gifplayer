import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { GifFile } from '../models/gif.model';
import { MAX_PLAYLIST_GIFS, Playlist } from '../models/playlist.model';

export interface CreatePlaylistParams {
  name: string;
  randomize: boolean;
  durationSeconds: number;
}

export type AddGifResult = 'added' | 'duplicate' | 'full' | 'not_found';

@Injectable({ providedIn: 'root' })
export class PlaylistService {
  private readonly storageKey = 'playlists';
  private playlistsSubject = new BehaviorSubject<Playlist[]>(this.loadPlaylists());
  playlists$ = this.playlistsSubject.asObservable();

  private loadPlaylists(): Playlist[] {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey) || '[]');
    } catch {
      return [];
    }
  }

  private savePlaylists(playlists: Playlist[]): void {
    localStorage.setItem(this.storageKey, JSON.stringify(playlists));
    this.playlistsSubject.next(playlists);
  }

  getPlaylists(): Playlist[] {
    return this.playlistsSubject.getValue();
  }

  getById(id: string): Playlist | undefined {
    return this.getPlaylists().find(p => p.id === id);
  }

  create(params: CreatePlaylistParams): Playlist {
    const playlist: Playlist = {
      id: crypto.randomUUID(),
      name: params.name.trim(),
      randomize: params.randomize,
      durationSeconds: params.durationSeconds,
      gifs: []
    };
    this.savePlaylists([...this.getPlaylists(), playlist]);
    return playlist;
  }

  isGifInPlaylist(playlistId: string, gif: GifFile): boolean {
    const playlist = this.getById(playlistId);
    return playlist?.gifs.some(g => g.file === gif.file) ?? false;
  }

  isPlaylistFull(playlistId: string): boolean {
    const playlist = this.getById(playlistId);
    return (playlist?.gifs.length ?? 0) >= MAX_PLAYLIST_GIFS;
  }

  addGif(playlistId: string, gif: GifFile): AddGifResult {
    const playlists = this.getPlaylists();
    const index = playlists.findIndex(p => p.id === playlistId);
    if (index === -1) return 'not_found';
    if (playlists[index].gifs.some(g => g.file === gif.file)) return 'duplicate';
    if (playlists[index].gifs.length >= MAX_PLAYLIST_GIFS) return 'full';

    const updated = [...playlists];
    updated[index] = {
      ...updated[index],
      gifs: [...updated[index].gifs, gif]
    };
    this.savePlaylists(updated);
    return 'added';
  }

  removeGif(playlistId: string, gif: GifFile): void {
    const updated = this.getPlaylists().map(p =>
      p.id === playlistId
        ? { ...p, gifs: p.gifs.filter(g => g.file !== gif.file) }
        : p
    );
    this.savePlaylists(updated);
  }
}
