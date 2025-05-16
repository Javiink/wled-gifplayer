import { Component, Input } from '@angular/core';
import { GifService } from '../services/gif.service';

@Component({
  selector: 'app-hidden',
  standalone: true,
  template: `
    @if (showHidden) {
      <div class="grid grid-cols-6 gap-4">
        @for (gif of hidden; track gif.file) {
          <div class="relative group">
            <img [src]="gifService.getGifUrl(gif.file)" class="w-[96px] h-[96px] object-contain">
          </div>
        }
      </div>
    }
  `
})
export class HiddenComponent {
  @Input() hidden: any[] = [];
  @Input() showHidden = false;

  constructor(protected gifService: GifService){ }
}
