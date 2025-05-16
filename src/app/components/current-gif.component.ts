import { Component, Input } from '@angular/core';
import { GifFile } from '../models/gif.model';
import { GifService } from '../services/gif.service';

@Component({
  selector: 'app-current-gif',
  standalone: true,
  template: `
    @if (currentGif) {
      <div class="mb-6 border p-4 rounded-lg bg-gray-100 text-center">
        <img [src]="gifService.getGifUrl(currentGif.file)" alt="Current GIF" class="mx-auto w-[192px] h-[192px] object-contain">
      </div>
    }
  `
})
export class CurrentGifComponent {
  @Input() currentGif: GifFile | null = null;

  constructor(public gifService: GifService) { }
}
