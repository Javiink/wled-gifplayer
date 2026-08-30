import { Component, output } from '@angular/core';

type NavSection = 'favorites' | 'playlists' | 'all-animations';

@Component({
  selector: 'app-nav-bar',
  standalone: true,
  template: `
    <nav
      class="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-cyan-900
             pt-[env(safe-area-inset-top)]"
      aria-label="Main navigation"
    >
      <div
        class="container mx-auto px-3 sm:px-4 py-2
               flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-0"
      >
        <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 min-w-0 flex-1">
          <div class="flex justify-between items-center w-full sm:w-auto sm:contents">
            <a
              href="#top"
              (click)="scrollToTop($event)"
              class="text-base sm:text-lg font-bold truncate max-w-[60vw] sm:max-w-none
                     hover:text-cyan-300 transition-colors"
            >
              WLED GIF Player
            </a>
            <div class="flex sm:hidden items-center shrink-0">
              <button
                type="button"
                class="min-w-11 min-h-11 flex items-center justify-center
                       text-cyan-400 hover:text-cyan-300 rounded hover:bg-cyan-900/50 cursor-pointer"
                aria-label="Help"
                (click)="helpClick.emit()"
              >
                <i class="fas fa-circle-question text-lg"></i>
              </button>
              <button
                type="button"
                class="min-w-11 min-h-11 flex items-center justify-center
                       text-cyan-400 hover:text-cyan-300 rounded hover:bg-cyan-900/50 cursor-pointer"
                aria-label="Settings"
                (click)="settingsClick.emit()"
              >
                <i class="fas fa-cog text-lg"></i>
              </button>
            </div>
          </div>

          <div
            class="flex items-center gap-4 sm:gap-6 overflow-x-auto
                   [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            @for (link of navLinks; track link.id) {
              <a
                [href]="'#' + link.id"
                (click)="scrollToSection(link.id, $event)"
                class="shrink-0 py-2 px-1 text-sm sm:text-base text-cyan-400/90 hover:text-cyan-100
                       whitespace-nowrap transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <i [class]="'fas ' + link.icon + ' ' + link.iconClass"></i>
                {{ link.label }}
              </a>
            }
          </div>
        </div>

        <div class="hidden sm:flex items-center shrink-0">
          <button
            type="button"
            class="min-w-11 min-h-11 flex items-center justify-center
                   text-cyan-400 hover:text-cyan-300 rounded hover:bg-cyan-900/50 cursor-pointer"
            aria-label="Help"
            (click)="helpClick.emit()"
          >
            <i class="fas fa-circle-question text-lg"></i>
          </button>
          <button
            type="button"
            class="min-w-11 min-h-11 flex items-center justify-center
                   text-cyan-400 hover:text-cyan-300 rounded hover:bg-cyan-900/50 cursor-pointer"
            aria-label="Settings"
            (click)="settingsClick.emit()"
          >
            <i class="fas fa-cog text-lg"></i>
          </button>
        </div>
      </div>
    </nav>
  `
})
export class AppNavBarComponent {
  settingsClick = output<void>();
  helpClick = output<void>();
  anchorClick = output<void>();

  readonly navLinks: { id: NavSection; label: string; icon: string; iconClass: string }[] = [
    { id: 'favorites', label: 'Favorites', icon: 'fa-heart', iconClass: '' },
    { id: 'playlists', label: 'Playlists', icon: 'fa-list', iconClass: '' },
    { id: 'all-animations', label: 'All animations', icon: 'fa-images', iconClass: '' }
  ];

  scrollToTop(event: Event): void {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  scrollToSection(sectionId: NavSection, event: Event): void {
    event.preventDefault();
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.anchorClick.emit();
  }
}
