import { Component, Input } from '@angular/core';
import { WledService } from '../services/wled.service';
import { GifService } from '../services/gif.service';
import { GifFile } from '../models/gif.model';

@Component({
  selector: 'app-favorites',
  standalone: true,
  template: `
    @if (favorites.length > 0) {
      <div class="mb-6">
        <h2 class="text-xl font-semibold mb-2">Favoritos</h2>
        <div class="grid grid-cols-6 gap-4">
          @for (gif of favorites; track gif.file) {
            <div class="relative group">
              <img [src]="this.gifService.getGifUrl(gif.file)" class="w-[96px] h-[96px] object-contain cursor-pointer gif" (click)="playGif(gif)">
              <div class="absolute top-2 right-2 text-red-500"><i class="fas fa-heart"></i></div>
            </div>
          }
        </div>
      </div>
    }
  `
})
export class FavoritesComponent {
  @Input() favorites: any[] = [];

  constructor(
    private wledService: WledService,
    protected gifService: GifService
  ) { }

  playGif(gif: GifFile): void {
    this.wledService.playGif(gif.file).subscribe();
  }
}
