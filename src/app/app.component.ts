import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Components
import { GifGridInfiniteComponent } from './components/gif-grid-infinite.component';
import { FavoritesComponent } from './components/favorites.component';
import { SettingsComponent } from './components/settings.component';
import { CurrentGifComponent } from './components/current-gif.component';
import { HiddenComponent } from './components/hidden.component';

// Models
import { GifFile } from './models/gif.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    GifGridInfiniteComponent,
    FavoritesComponent,
    SettingsComponent,
    CurrentGifComponent,
    HiddenComponent
  ],
  template: `
    <div class="container mx-auto p-4">
      <h1 class="text-3xl font-bold mb-4">Matrix LED GIF Player</h1>

      <!-- Current Playing -->
      <app-current-gif></app-current-gif>

      <!-- Settings -->
      <button (click)="toggleSettings()" class="mb-4 px-4 py-2 bg-blue-500 text-white rounded">⚙️ Configuración</button>
      <app-settings *ngIf="showSettings"></app-settings>

      <!-- Favorites -->
      <app-favorites [favorites]="favorites"></app-favorites>

      <!-- Grid con Infinite Scroll -->
      <h2 class="text-xl font-semibold mb-2">GIFs Disponibles</h2>
      <app-gif-grid-infinite></app-gif-grid-infinite>

      <!-- Hidden -->
      <button (click)="showHidden = !showHidden" class="mb-2 text-blue-500">
        ▶ {{ showHidden ? 'Ocultar' : 'Mostrar' }} Ocultados
      </button>
      <app-hidden [hidden]="hidden" [showHidden]="showHidden"></app-hidden>
    </div>
  `
})
export class AppComponent {
  favorites: GifFile[] = JSON.parse(localStorage.getItem('favorites') || '[]');
  hidden: GifFile[] = JSON.parse(localStorage.getItem('hidden') || '[]');
  showSettings = false;
  showHidden = false;

  constructor() {
  }

  toggleSettings(): void {
    this.showSettings = !this.showSettings;
  }
}
