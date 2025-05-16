import { Component, Input } from '@angular/core';
import { WledService } from '../services/wled.service';
import { GifService } from '../services/gif.service';
import { GifFile } from '../models/gif.model';

@Component({
  selector: 'app-gif-grid',
  standalone: true,
  template: `
    <div class="grid grid-cols-6 gap-4">
      @for (gif of gifs; track gif.file) {
        <div class="relative group">
          <img [src]="this.gifService.getGifUrl(gif.file)" class="w-[96px] h-[96px] object-contain cursor-pointer" (click)="playGif(gif)">
          <div class="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-2">
            <button (click)="playGif(gif)" title="Reproducir"><i class="fas fa-play"></i></button>
            <button (click)="toggleFavorite(gif)" title="Favorito">
              <i [class.fas]="isFavorite(gif)" [class.far]="!isFavorite(gif)" class="fa-heart"></i>
            </button>
            <button (click)="hideGif(gif)" title="Ocultar"><i class="fas fa-eye-slash"></i></button>
          </div>
        </div>
      }
    </div>
  `
})
export class GifGridComponent {
  @Input() gifs: GifFile[] = [];
  favorites: GifFile[] = JSON.parse(localStorage.getItem('favorites') || '[]');

  constructor(
    private wledService: WledService,
    protected gifService: GifService
  ) { }

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
