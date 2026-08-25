import { Component, ElementRef, HostListener, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { GifFile } from '../models/gif.model';
import { MAX_PLAYLIST_GIFS, Playlist } from '../models/playlist.model';
import { GifService } from '../services/gif.service';
import { WledService } from '../services/wled.service';
import { FavoritesService } from '../services/favorites.service';
import { PlaylistService } from '../services/playlist.service';
import { ModalService } from '../services/modal.service';
import { CreatePlaylistModalComponent } from './create-playlist-modal.component';
import { HtmlModalContentComponent } from './html-modal-content-component';
import { AsyncPipe, NgClass } from '@angular/common';

@Component({
  selector: 'app-gif-item',
  standalone: true,
  imports: [NgClass, AsyncPipe],
  template: `
    <div
      class="relative group aspect-square rounded-xs drop-shadow-xl drop-shadow-cyan-900 hover:ring-1 hover:ring-cyan-300 hover:drop-shadow-cyan-600 transition-shadow gif-item"
      [class.z-[200]]="playlistMenuOpen"
      (mouseleave)="onTileMouseLeave()">
      <div class="absolute inset-0 overflow-hidden rounded-xs cursor-pointer" (click)="onPlay()">
        @if (mode === 'playlist' && !(playlist?.gifs?.length)) {
          <div class="size-full flex items-center justify-center bg-cyan-950 text-cyan-600">
            <i class="fas fa-list fa-2x"></i>
          </div>
        } @else if (mode === 'playlist' && previewUrls.length > 1) {
          @for (url of previewUrls; track url; let i = $index) {
            <img
              [src]="url"
              class="absolute inset-0 size-full gif transition-opacity duration-300"
              [class.opacity-0]="i !== previewIndex"
              [class.opacity-100]="i === previewIndex"
              [class.pointer-events-none]="i !== previewIndex">
          }
        } @else {
          <img [src]="previewUrl" class="size-full gif">
        }
        <div class="size-full absolute top-0 left-0 bg-black opacity-0 sm:group-hover:opacity-20 pointer-events-none"></div>
      </div>

      <div
        class="absolute inset-0 p-1 transition-opacity pointer-events-none"
        [class.opacity-90]="playlistMenuOpen"
        [class.sm:opacity-0]="!playlistMenuOpen"
        [class.sm:group-hover:opacity-90]="!playlistMenuOpen">
        <div class="relative flex size-full items-center justify-center pointer-events-none">
          <button
            (click)="onPlay(); $event.stopPropagation()"
            [disabled]="mode === 'playlist' && !(playlist?.gifs?.length)"
            [title]="mode === 'playlist' && !(playlist?.gifs?.length) ? 'Playlist is empty' : 'Play'"
            class="pointer-events-auto opacity-40 hover:opacity-100 text-white text-shadow-lg text-shadow-black cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
            <i class="fas fa-play fa-2x sm:text-5xl!"></i>
          </button>
          @if (showFavorite) {
            <button (click)="toggleFavorite(gif); $event.stopPropagation()" title="Favorite" class="pointer-events-auto absolute left-1 top-0 opacity-50 hover:opacity-100 sm:text-base text-xl text-white text-shadow-sm text-shadow-black cursor-pointer">
              <i [ngClass]="{'fas text-red-600': isFavorite(gif)}" [class.far]="!isFavorite(gif)" class="fa-heart"></i>
            </button>
          }
          @if (showPlaylistPicker) {
            <div class="absolute right-1 top-0 pointer-events-auto" #playlistPickerRef>
              <button (click)="togglePlaylistMenu($event)" title="Add to playlist" class="opacity-50 hover:opacity-100 sm:text-base text-xl text-white text-shadow-sm text-shadow-black cursor-pointer">
                <i class="fas fa-list-ul"></i>
              </button>
              @if (playlistMenuOpen) {
                <div #playlistMenuRef class="absolute right-0 top-full mt-1 z-[300] min-w-40 max-w-52 bg-cyan-950 border border-cyan-700 rounded-lg shadow-lg py-1 text-sm text-left pointer-events-auto"
                  [style.transform]="playlistMenuShiftRight ? 'translateX(50%)' : null">
                  @if (playlistService.playlists$ | async; as playlists) {
                    @if (playlists.length === 0) {
                      <p class="px-3 py-1 text-cyan-400/70 text-xs">No playlists yet</p>
                    }
                    @for (pl of playlists; track pl.id) {
                      <button
                        (click)="addToPlaylist(pl.id, $event)"
                        class="w-full px-3 py-1.5 text-left hover:bg-cyan-900 cursor-pointer truncate disabled:opacity-40 disabled:cursor-not-allowed"
                        [class.text-cyan-400]="isGifInPlaylist(pl.id)"
                        [disabled]="!isGifInPlaylist(pl.id) && playlistService.isPlaylistFull(pl.id)"
                        [title]="!isGifInPlaylist(pl.id) && playlistService.isPlaylistFull(pl.id) ? 'Playlist is full' : ''">
                        {{ pl.name }}
                        @if (isGifInPlaylist(pl.id)) {
                          <i class="fas fa-check ml-1 text-xs"></i>
                        }
                      </button>
                    }
                  }
                  <div class="border-t border-cyan-800 my-1"></div>
                  <button (click)="openCreatePlaylist($event)" class="w-full px-3 py-1.5 text-left hover:bg-cyan-900 cursor-pointer text-cyan-300">
                    <i class="fas fa-plus mr-1"></i> Create new playlist
                  </button>
                </div>
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    .grid {
      grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    }
  `
})
export class GifItemComponent implements OnInit, OnDestroy {
  @Input({ required: true }) gif!: GifFile;
  @Input() mode: 'gif' | 'playlist' = 'gif';
  @Input() playlist?: Playlist;
  @Input() showFavorite = true;
  @Input() showPlaylistPicker = true;

  @ViewChild('playlistPickerRef') playlistPickerRef?: ElementRef<HTMLElement>;
  @ViewChild('playlistMenuRef') playlistMenuRef?: ElementRef<HTMLElement>;

  previewUrl = '';
  previewUrls: string[] = [];
  previewIndex = 0;
  playlistMenuOpen = false;
  playlistMenuShiftRight = false;
  private previewInterval?: ReturnType<typeof setInterval>;

  constructor(
    public gifService: GifService,
    private wledService: WledService,
    public favoritesService: FavoritesService,
    public playlistService: PlaylistService,
    private modal: ModalService
  ) {}

  ngOnInit(): void {
    if (this.mode === 'playlist' && this.playlist?.gifs.length) {
      this.previewUrls = this.playlist.gifs.map(g => this.gifService.getGifUrl(g.file));
      this.previewUrl = this.previewUrls[0];
      this.gifService.preloadGifs(this.playlist.gifs.map(g => g.file)).catch(() => {});

      if (this.playlist.gifs.length > 1) {
        this.previewInterval = setInterval(() => {
          this.previewIndex = (this.previewIndex + 1) % this.previewUrls.length;
        }, 1500);
      }
    } else {
      this.previewUrl = this.gifService.getGifUrl(this.gif.file);
    }
  }

  ngOnDestroy(): void {
    if (this.previewInterval) {
      clearInterval(this.previewInterval);
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (this.playlistMenuOpen) {
      this.updatePlaylistMenuPlacement();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.playlistMenuOpen) return;
    const el = this.playlistPickerRef?.nativeElement;
    if (el && !el.contains(event.target as Node)) {
      this.closePlaylistMenu();
    }
  }

  onTileMouseLeave(): void {
    this.closePlaylistMenu();
  }

  private closePlaylistMenu(): void {
    this.playlistMenuOpen = false;
    this.playlistMenuShiftRight = false;
  }

  isFavorite(gif: GifFile): boolean {
    return this.favoritesService.isFavorite(gif);
  }

  toggleFavorite(gif: GifFile): void {
    this.favoritesService.toggleFavorite(gif);
  }

  isGifInPlaylist(playlistId: string): boolean {
    return this.playlistService.isGifInPlaylist(playlistId, this.gif);
  }

  togglePlaylistMenu(event: Event): void {
    event.stopPropagation();
    this.playlistMenuOpen = !this.playlistMenuOpen;
    if (this.playlistMenuOpen) {
      setTimeout(() => this.updatePlaylistMenuPlacement(), 0);
    } else {
      this.playlistMenuShiftRight = false;
    }
  }

  private updatePlaylistMenuPlacement(): void {
    const menuEl = this.playlistMenuRef?.nativeElement;
    if (!menuEl) {
      this.playlistMenuShiftRight = false;
      return;
    }

    const rect = menuEl.getBoundingClientRect();
    this.playlistMenuShiftRight = rect.left < 0;
  }

  addToPlaylist(playlistId: string, event: Event): void {
    event.stopPropagation();
    const result = this.playlistService.addGif(playlistId, this.gif);
    if (result === 'full') {
      this.showPlaylistFullWarning();
    }
    this.closePlaylistMenu();
  }

  async openCreatePlaylist(event: Event): Promise<void> {
    event.stopPropagation();
    this.closePlaylistMenu();
    const created = await this.modal.open<CreatePlaylistModalComponent, Playlist | undefined>(
      CreatePlaylistModalComponent
    );
    if (created) {
      const result = this.playlistService.addGif(created.id, this.gif);
      if (result === 'full') {
        this.showPlaylistFullWarning();
      }
    }
  }

  private showPlaylistFullWarning(): void {
    this.modal.open(HtmlModalContentComponent, {
      html: `<p class="mx-3">This playlist already has the maximum of <strong>${MAX_PLAYLIST_GIFS}</strong> GIFs.</p>`
    });
  }

  onPlay(): void {
    if (this.mode === 'playlist' && this.playlist) {
      if (!this.playlist.gifs.length) return;
      this.wledService.playPlaylist(this.playlist).subscribe();
    } else {
      this.wledService.playGif(this.gif.file).subscribe();
    }
  }
}
