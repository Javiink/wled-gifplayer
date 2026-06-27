import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { GifFile } from '../models/gif.model';
import { Playlist } from '../models/playlist.model';

export interface CreatePlaylistParams {
  name: string;
  randomize: boolean;
  durationSeconds: number;
}

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

  addGif(playlistId: string, gif: GifFile): boolean {
    const playlists = this.getPlaylists();
    const index = playlists.findIndex(p => p.id === playlistId);
    if (index === -1) return false;
    if (playlists[index].gifs.some(g => g.file === gif.file)) return false;

    const updated = [...playlists];
    updated[index] = {
      ...updated[index],
      gifs: [...updated[index].gifs, gif]
    };
    this.savePlaylists(updated);
    return true;
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
