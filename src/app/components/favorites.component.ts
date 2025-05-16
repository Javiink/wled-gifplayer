import { Component, Input } from '@angular/core';
import { WledService } from '../services/wled.service';
import { GifService } from '../services/gif.service';

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

  async playGif(gif: any): Promise<void> {
    const ip = this.wledService.getWledIp();
    if (!ip) {
      alert('Configura la IP de WLED primero.');
      return;
    }

    const currentFile = await this.wledService.getCurrentGif(ip).toPromise();

    const gifUrl = this.gifService.getGifUrl(gif.file);

    await this.wledService.uploadGif(ip, gifUrl);
    await this.wledService.playGif(ip, gif.file);

    if (currentFile && currentFile !== gif.file) {
      await this.wledService.deleteOldGif(ip, currentFile);
    }
  }
}
