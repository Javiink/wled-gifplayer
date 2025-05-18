import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Components
import { GifGridInfiniteComponent } from './components/gif-grid-infinite.component';
import { FavoritesComponent } from './components/favorites.component';
import { SettingsComponent } from './components/settings.component';
import { CurrentGifComponent } from './components/current-gif.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    GifGridInfiniteComponent,
    FavoritesComponent,
    SettingsComponent,
    CurrentGifComponent
  ],
  templateUrl: 'app.component.html'
})
export class AppComponent {
  showSettings = false;

  constructor() {
  }

  toggleSettings(): void {
    this.showSettings = !this.showSettings;
  }
}
