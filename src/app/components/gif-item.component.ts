import { Component, Input } from '@angular/core';
import { GifFile } from '../models/gif.model';
import { GifService } from '../services/gif.service';
import { WledService } from '../services/wled.service';
import { FavoritesService } from '../services/favorites.service';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-gif-item',
  standalone: true,
  imports: [NgClass],
  template: `
    <div class="relative group aspect-square rounded-xs overflow-hidden drop-shadow-xl drop-shadow-cyan-900 hover:ring-1 hover:ring-cyan-300 hover:drop-shadow-cyan-600 transition-shadow gif-item">
      <img [src]="gifService.getGifUrl(gif.file)" class="size-full gif" (click)="playGif(gif)">
      <div class="size-full absolute top-0 left-0 bg-black opacity-0 group-hover:opacity-20"></div>
      <div class="absolute opacity-0 size-full top-0 left-0 p-1 group-hover:opacity-90 transition-opacity flex justify-center-safe space-x-2">
        <button (click)="playGif(gif)" title="Reproducir" class="opacity-50 hover:opacity-100 m-0! text-white text-shadow-lg text-shadow-black cursor-pointer">
          <i class="fas fa-play fa-3x"></i>
        </button>
        <button (click)="toggleFavorite(gif)" title="Favorito" class="absolute left-1 top-0 opacity-50 hover:opacity-100 text-white text-shadow-sm text-shadow-black cursor-pointer">
          <i [ngClass]="{'fas text-red-600': isFavorite(gif)}" [class.far]="!isFavorite(gif)" class="fa-heart"></i>
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

  constructor(
    public gifService: GifService,
    private wledService: WledService,
    public favoritesService: FavoritesService
  ) { }

  isFavorite(gif: GifFile): boolean {
    return this.favoritesService.isFavorite(gif);
  }

  toggleFavorite(gif: GifFile): void {
    this.favoritesService.toggleFavorite(gif);
  }

  playGif(gif: GifFile): void {
    this.wledService.playGif(gif.file).subscribe();
  }
}
