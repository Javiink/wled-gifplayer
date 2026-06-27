import { Component } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { PlaylistService } from '../services/playlist.service';
import { GifItemComponent } from './gif-item.component';
import { GifFile } from '../models/gif.model';
import { Playlist } from '../models/playlist.model';

@Component({
  selector: 'app-playlists',
  standalone: true,
  imports: [AsyncPipe, GifItemComponent],
  template: `
    @if (playlistService.playlists$ | async; as playlists) {
      @if (playlists.length > 0) {
        <div class="mb-6">
          <h2 class="text-xl font-semibold mb-2"><i class="fas fa-list text-cyan-500"></i> Playlists</h2>
          <div class="grid gap-4 gif-grid">
            @for (pl of playlists; track pl.id) {
              <div class="flex flex-col">
                <app-gif-item
                  mode="playlist"
                  [playlist]="pl"
                  [gif]="getPreviewGif(pl)"
                  [showFavorite]="false"
                  [showPlaylistPicker]="false">
                </app-gif-item>
                <p class="text-center text-sm mt-1 truncate" [title]="pl.name">{{ pl.name }}</p>
              </div>
            }
          </div>
        </div>
      }
    }
  `
})
export class PlaylistsComponent {
  constructor(public playlistService: PlaylistService) {}

  getPreviewGif(playlist: Playlist): GifFile {
    if (playlist.gifs.length > 0) {
      return playlist.gifs[0];
    }
    return { file: '', date: 0 };
  }
}
