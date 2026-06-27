import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlaylistService } from '../services/playlist.service';
import { PLAYLIST_DURATION_OPTIONS, Playlist } from '../models/playlist.model';

@Component({
  selector: 'app-create-playlist-modal',
  standalone: true,
  imports: [FormsModule],
  template: `
    <p class="mb-4 text-xl"><i class="fas fa-list"></i> New playlist</p>
    <div class="space-y-4">
      <div>
        <label class="block mb-1">Name</label>
        <input [(ngModel)]="name" placeholder="My playlist" class="w-full bg-cyan-900 border border-cyan-700 p-2 rounded-lg">
      </div>
      <div class="flex items-center justify-between gap-4">
        <label for="randomize">Shuffle playback</label>
        <input id="randomize" type="checkbox" [(ngModel)]="randomize" class="w-5 h-5 accent-cyan-500 cursor-pointer">
      </div>
      <div>
        <label class="block mb-1">Duration per GIF</label>
        <select [(ngModel)]="durationSeconds" class="w-full bg-cyan-900 border border-cyan-700 p-2 rounded-lg">
          @for (d of durationOptions; track d) {
            <option [ngValue]="d">{{ d }} seconds</option>
          }
        </select>
      </div>
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
  durationOptions = PLAYLIST_DURATION_OPTIONS;
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
