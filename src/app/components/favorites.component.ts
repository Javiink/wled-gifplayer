import { Component } from '@angular/core';
import { GifService } from '../services/gif.service';
import { FavoritesService } from '../services/favorites.service';
import { AsyncPipe, NgIf, } from '@angular/common';
import { GifItemComponent } from './gif-item.component';

@Component({
  selector: 'app-favorites',
  standalone: true,
  imports: [NgIf, AsyncPipe, GifItemComponent],
  template: `
    <ng-container *ngIf="favoritesService.favorites$ | async as favorites">
      @if (favorites.length > 0) {
        <div class="mb-6">
          <h2 class="text-xl font-semibold mb-2"><i class="fas fa-heart text-red-600"></i> Favourited</h2>
          <div class="grid grid-cols-6 gap-4">
            @for (gif of favorites; track gif.file) {
              <app-gif-item [gif]="gif"></app-gif-item>
            }
          </div>
        </div>
      }
    </ng-container>
  `
})
export class FavoritesComponent {
  constructor(
    public favoritesService: FavoritesService,
    protected gifService: GifService
  ) { }
}
