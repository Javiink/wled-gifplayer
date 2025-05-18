import { Component, Input, OnInit } from '@angular/core';
import { GifService } from '../services/gif.service';
import { WledService } from '../services/wled.service';
import { AsyncPipe } from '@angular/common';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-current-gif',
  standalone: true,
  imports: [AsyncPipe],
  template: `
      <div class="p-4 text-center aspect-square">
        <div class="mx-auto w-[192px] h-[192px] flex justify-center items-center object-contain">
          @if (currentGif | async) {
            <img [src]="gifService.getGifUrl((currentGif | async)!)" alt="Current GIF" class="size-full shadow-2xl shadow-cyan-500/50 ring-1 ring-cyan-400 rounded-sm gif">
          } @else {
            <p class="text-8xl font-mono">?</p>
          }
        </div>
      </div>
  `
})
export class CurrentGifComponent {
  currentGif: Observable<string | null>;

  constructor(public gifService: GifService, public wledService: WledService) {
    this.currentGif = wledService.currentGif$;
    this.wledService.updateCurrentGif();
  }
}
