import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PLAYLIST_DURATION_OPTIONS } from '../models/playlist.model';

@Component({
  selector: 'app-playlist-params-form',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div [class]="spacingClass">
      <div>
        <label class="block mb-1" [attr.for]="idPrefix + '-name'">Name</label>
        <input
          [id]="idPrefix + '-name'"
          [ngModel]="name"
          (ngModelChange)="nameChange.emit($event)"
          (blur)="nameBlur.emit()"
          placeholder="My playlist"
          class="w-full bg-cyan-900 border border-cyan-700 p-2 rounded-lg">
      </div>
      <div class="flex items-center gap-4">
        <input
          [id]="idPrefix + '-randomize'"
          type="checkbox"
          [ngModel]="randomize"
          (ngModelChange)="randomizeChange.emit($event)"
          class="w-5 h-5 accent-cyan-500 cursor-pointer">
        <label [attr.for]="idPrefix + '-randomize'">Shuffle playback</label>
      </div>
      <div>
        <label class="block mb-1" [attr.for]="idPrefix + '-duration'">Duration per GIF</label>
        <select
          [id]="idPrefix + '-duration'"
          [ngModel]="durationSeconds"
          (ngModelChange)="durationSecondsChange.emit($event)"
          class="w-full bg-cyan-900 border border-cyan-700 p-2 rounded-lg">
          @for (d of durationOptions; track d) {
            <option [ngValue]="d">{{ d }} seconds</option>
          }
        </select>
      </div>
    </div>
  `
})
export class PlaylistParamsFormComponent {
  @Input() name = '';
  @Input() randomize = false;
  @Input() durationSeconds = 5;
  /** Prefix for input ids (avoids clashes if both modals ever coexist). */
  @Input() idPrefix = 'playlist';
  @Input() spacingClass = 'space-y-4';

  @Output() nameChange = new EventEmitter<string>();
  @Output() randomizeChange = new EventEmitter<boolean>();
  @Output() durationSecondsChange = new EventEmitter<number>();
  @Output() nameBlur = new EventEmitter<void>();

  readonly durationOptions = PLAYLIST_DURATION_OPTIONS;
}
