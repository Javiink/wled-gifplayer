import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Components
import { GifGridInfiniteComponent } from './components/gif-grid-infinite.component';
import { FavoritesComponent } from './components/favorites.component';
import { PlaylistsComponent } from './components/playlists.component';
import { SettingsComponent } from './components/settings.component';
import { CurrentGifComponent } from './components/current-gif.component';
import { WelcomeToastComponent } from './components/welcome-toast.component';
import { ModalService } from './services/modal.service';
import { WelcomeService } from './services/welcome.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    GifGridInfiniteComponent,
    FavoritesComponent,
    PlaylistsComponent,
    CurrentGifComponent,
    WelcomeToastComponent
  ],
  templateUrl: 'app.component.html'
})
export class AppComponent implements OnInit {
  showWelcomeToast = false;

  constructor(
    private modal: ModalService,
    private welcome: WelcomeService
  ) {}

  ngOnInit(): void {
    this.showWelcomeToast = this.welcome.shouldShow();
  }

  onWelcomeDismiss(): void {
    this.welcome.dismiss();
    this.showWelcomeToast = false;
  }

  async openConfigDialog() {
    await this.modal.open(SettingsComponent);
  }
}
