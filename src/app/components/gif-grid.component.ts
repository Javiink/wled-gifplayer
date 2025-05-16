import { Component, Input } from '@angular/core';
import { WledService } from '../services/wled.service';
import { GifService } from '../services/gif.service';

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
  @Input() gifs: any[] = [];
  favorites: any[] = JSON.parse(localStorage.getItem('favorites') || '[]');

  constructor(
    private wledService: WledService,
    protected gifService: GifService
  ) { }

  isFavorite(gif: any): boolean {
    return this.favorites.some(f => f.file === gif.file);
  }

  toggleFavorite(gif: any): void {
    const index = this.favorites.findIndex(f => f.file === gif.file);
    if (index > -1) {
      this.favorites.splice(index, 1);
    } else {
      this.favorites.push(gif);
    }
    localStorage.setItem('favorites', JSON.stringify(this.favorites));
  }

  hideGif(gif: any): void {
    let hidden = JSON.parse(localStorage.getItem('hidden') || '[]');
    hidden.push(gif);
    localStorage.setItem('hidden', JSON.stringify(hidden));
  }

  async playGif(gif: any): Promise<void> {
    const ip = this.wledService.getWledIp();
    if (!ip) {
      alert('Configura la IP de WLED primero.');
      return;
    }

    //const currentFile = await this.wledService.getCurrentGif(ip).toPromise();

    const gifUrl = this.gifService.getGifUrl(gif.file);

    this.wledService.uploadGif(ip, gifUrl);
    this.wledService.playGif(ip, gif.file);

    //if (currentFile && currentFile !== gif.file) {
    //  await this.wledService.deleteOldGif(ip, currentFile);
    //}
  }
}
