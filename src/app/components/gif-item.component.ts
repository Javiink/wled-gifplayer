import { Component, Input } from '@angular/core';
import { GifFile } from '../models/gif.model';
import { GifService } from '../services/gif.service';
import { WledService } from '../services/wled.service';

@Component({
  selector: 'app-gif-item',
  standalone: true,
  template: `
    <div class="relative group aspect-square gif-item">
      <img [src]="gifService.getGifUrl(gif.file)" class="size-full gif" (click)="playGif(gif)">
      <div class="size-full absolute top-0 left-0 bg-black opacity-0 group-hover:opacity-20"></div>
      <div class="absolute opacity-0 size-full top-0 left-0 p-1 group-hover:opacity-90 transition-opacity flex justify-center-safe space-x-2">
        <button (click)="playGif(gif)" title="Reproducir" class="opacity-50 hover:opacity-100 m-0! text-white text-shadow-lg text-shadow-black cursor-pointer">
          <i class="fas fa-play fa-3x"></i>
        </button>
        <button (click)="toggleFavorite(gif)" title="Favorito" class="absolute left-1 top-0 opacity-50 hover:opacity-100 text-white text-shadow-sm text-shadow-black cursor-pointer">
          <i [class.fas]="isFavorite(gif)" [class.far]="!isFavorite(gif)" class="fa-heart"></i>
        </button>
      </div>
    </div>
  `,
  styles: `
    .grid {
      grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    }
  `
})
export class GifItemComponent {
  @Input({ required: true }) gif!: GifFile;
  favorites: any[] = JSON.parse(localStorage.getItem('favorites') || '[]');

  constructor(public gifService: GifService, private wledService: WledService) { }

  isFavorite(gif: GifFile): boolean {
    return this.favorites.some(f => f.file === gif.file);
  }

  toggleFavorite(gif: GifFile): void {
    const index = this.favorites.findIndex(f => f.file === gif.file);
    if (index > -1) {
      this.favorites.splice(index, 1);
    } else {
      this.favorites.push(gif);
    }
    localStorage.setItem('favorites', JSON.stringify(this.favorites));
  }

  hideGif(gif: GifFile): void {
    let hidden = JSON.parse(localStorage.getItem('hidden') || '[]');
    hidden.push(gif);
    localStorage.setItem('hidden', JSON.stringify(hidden));
  }

  playGif(gif: GifFile): void {
    this.wledService.playGif(gif.file).subscribe();
  }
}
