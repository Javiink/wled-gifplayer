import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { GifFile } from '../models/gif.model';
import { Playlist } from '../models/playlist.model';
import { PlaylistService } from '../services/playlist.service';
import { GifItemComponent } from './gif-item.component';
import { PlaylistParamsFormComponent } from './playlist-params-form.component';

@Component({
  selector: 'app-edit-playlist-modal',
  standalone: true,
  imports: [GifItemComponent, PlaylistParamsFormComponent],
  template: `
    @if (playlist) {
      <div class="w-64 sm:w-96 md:w-2xl">
        <p class="mb-4 text-xl pr-6"><i class="fas fa-pencil"></i> Edit playlist</p>

        <!-- Top: preview + form -->
        <div class="flex flex-col sm:flex-row gap-4 sm:items-stretch mb-5">
          <!-- Explicit size required: gif-item content is absolutely positioned (no intrinsic size). -->
          <div class="preview-slot mx-auto sm:mx-0 size-48 shrink-0 self-center">
            <app-gif-item
              class="block size-full"
              mode="playlist"
              [playlist]="playlist"
              [gif]="previewGif"
              [showFavorite]="false"
              [showPlaylistPicker]="false"
              [showEdit]="false">
            </app-gif-item>
          </div>

          <div class="flex-1 min-w-0 flex flex-col gap-3 justify-between">
            <app-playlist-params-form
              idPrefix="edit-playlist"
              spacingClass="space-y-3"
              [name]="name"
              [randomize]="randomize"
              [durationSeconds]="durationSeconds"
              (nameChange)="onNameChange($event)"
              (randomizeChange)="onRandomizeChange($event)"
              (durationSecondsChange)="onDurationChange($event)"
              (nameBlur)="onNameBlur()">
            </app-playlist-params-form>

            <button
              type="button"
              (click)="deletePlaylist()"
              class="w-full border border-red-500/60 text-red-400 hover:bg-red-950/50 px-4 py-2 rounded cursor-pointer">
              <i class="fas fa-trash"></i> Delete playlist
            </button>
          </div>
        </div>

        <!-- Bottom: GIF grid -->
        <div>
          <p class="mb-2 text-sm text-cyan-300">
            GIFs ({{ playlist.gifs.length }})
          </p>
          @if (playlist.gifs.length === 0) {
            <p class="text-sm text-cyan-400/70">No GIFs in this playlist yet.</p>
          } @else {
            <div class="overflow-visible">
              <div class="grid gap-4 gif-grid">
                @for (gif of playlist.gifs; track gif.file) {
                  <app-gif-item
                    [gif]="gif"
                    [showFavorite]="false"
                    [showPlaylistPicker]="false"
                    [showRemove]="true"
                    (remove)="removeGif($event)">
                  </app-gif-item>
                }
              </div>
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: `
    :host ::ng-deep .preview-slot .gif-item {
      width: 100%;
      height: 100%;
    }
  `
})
export class EditPlaylistModalComponent implements OnInit, OnDestroy {
  playlistId!: string;
  close!: (result?: void) => void;

  playlist?: Playlist;
  name = '';
  randomize = false;
  durationSeconds = 5;
  previewGif: GifFile = { file: '', date: 0 };

  private sub?: Subscription;

  constructor(private playlistService: PlaylistService) {}

  ngOnInit(): void {
    this.sub = this.playlistService.playlists$.subscribe(() => {
      const pl = this.playlistService.getById(this.playlistId);
      if (!pl) {
        this.close?.();
        return;
      }
      this.playlist = pl;
      this.previewGif = pl.gifs[0] ?? { file: '', date: 0 };
      // Keep local form fields in sync unless the user is mid-edit on name
      if (document.activeElement?.id !== 'edit-playlist-name') {
        this.name = pl.name;
      }
      this.randomize = pl.randomize;
      this.durationSeconds = pl.durationSeconds;
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  onNameChange(value: string): void {
    this.name = value;
    if (value.trim()) {
      this.playlistService.update(this.playlistId, { name: value });
    }
  }

  onNameBlur(): void {
    if (!this.name.trim() && this.playlist) {
      this.name = this.playlist.name;
    } else if (this.name.trim()) {
      this.playlistService.update(this.playlistId, { name: this.name });
    }
  }

  onRandomizeChange(value: boolean): void {
    this.randomize = value;
    this.playlistService.update(this.playlistId, { randomize: value });
  }

  onDurationChange(value: number): void {
    this.durationSeconds = value;
    this.playlistService.update(this.playlistId, { durationSeconds: value });
  }

  removeGif(gif: GifFile): void {
    this.playlistService.removeGif(this.playlistId, gif);
  }

  deletePlaylist(): void {
    this.playlistService.delete(this.playlistId);
    this.close?.();
  }
}
