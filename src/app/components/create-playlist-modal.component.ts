import { Component } from '@angular/core';
import { PlaylistService } from '../services/playlist.service';
import { Playlist } from '../models/playlist.model';
import { PlaylistParamsFormComponent } from './playlist-params-form.component';

@Component({
  selector: 'app-create-playlist-modal',
  standalone: true,
  imports: [PlaylistParamsFormComponent],
  template: `
    <p class="mb-4 text-xl"><i class="fas fa-list"></i> New playlist</p>
    <div class="flex flex-col space-y-4">
      <app-playlist-params-form
        idPrefix="create-playlist"
        [(name)]="name"
        [(randomize)]="randomize"
        [(durationSeconds)]="durationSeconds">
      </app-playlist-params-form>
      <button (click)="save()" [disabled]="!name.trim()" class="w-full bg-cyan-500 shadow-lg shadow-cyan-500/50 px-4 py-2 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
        <i class="fas fa-save"></i> Save
      </button>
    </div>
  `
})
export class CreatePlaylistModalComponent {
  name = '';
  randomize = false;
  durationSeconds = 5;
  close!: (result?: Playlist) => void;

  constructor(private playlistService: PlaylistService) {}

  save(): void {
    if (!this.name.trim()) return;
    const playlist = this.playlistService.create({
      name: this.name,
      randomize: this.randomize,
      durationSeconds: this.durationSeconds
    });
    if (this.close) this.close(playlist);
  }
}
