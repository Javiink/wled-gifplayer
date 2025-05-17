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
      <div class="mb-6 border p-4 rounded-lg bg-gray-100 text-center">
        <div class="mx-auto w-[192px] h-[192px] flex justify-center items-center object-contain">
          @if (currentGif | async) {
            <img [src]="gifService.getGifUrl((currentGif | async)!)" alt="Current GIF" class="size-full gif">
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
    this.wledService.currentGif();
  }
}
