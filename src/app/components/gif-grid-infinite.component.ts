import { Component, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { GifFile } from '../models/gif.model';
import { GifService } from '../services/gif.service';
import { GifItemComponent } from './gif-item.component';

@Component({
  selector: 'app-gif-grid-infinite',
  standalone: true,
  imports: [GifItemComponent],
  template: `
    <div>
      <div class="grid gap-4 gif-grid">
        @for (gif of displayedGifs; track gif.file) {
          <app-gif-item [gif]="gif"></app-gif-item>
        }
      </div>

      <div #sentinel class="h-1"></div>
    </div>
  `
})
export class GifGridInfiniteComponent implements AfterViewInit {
  pageSize = 150;
  currentPage = 0;
  displayedGifs: GifFile[] = [];
  favorites: any[] = JSON.parse(localStorage.getItem('favorites') || '[]');

  @ViewChild('sentinel') sentinel!: ElementRef;

  constructor(
    protected gifService: GifService
  ) { }

  ngAfterViewInit(): void {
    this.setupIntersectionObserver();
  }

  loadPage(): void {
    this.gifService.getGifsPaginated(this.currentPage, this.pageSize).subscribe(gifs => {
      if (gifs.length === 0) return;

      this.displayedGifs = [...this.displayedGifs, ...gifs];
      this.currentPage++;
    });
  }

  setupIntersectionObserver(): void {
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        this.loadPage();
      }
    }, {
      rootMargin: '0px 0px 200px 0px'
    });

    observer.observe(this.sentinel.nativeElement);
  }
}
