import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { GifFile } from '../models/gif.model';

@Injectable({ providedIn: 'root' })
export class GifService {
  private gifServer = 'https://tools.javi.ink/matriink'
  private defaultEndpoint = this.gifServer + '/gif-collection.php';
  public gifsCache: GifFile[] = [];

  constructor(private http: HttpClient) { }

  loadAllGifs(endpoint?: string): Observable<GifFile[]> {
    const url = endpoint || this.defaultEndpoint;

    return this.http.get<GifFile[]>(url).pipe(
      map(gifs => {
        this.gifsCache = gifs;
        return gifs;
      }),
      catchError(() => of([]))
    );
  }

  getGifUrl(filename: string): string {
    return this.gifServer + `/matrix-gifs/${filename}`;
  }

  getGifsPaginated(page: number, pageSize: number): Observable<GifFile[]> {
    if (this.getTotalGifCount() === 0) {
      return this.loadAllGifs().pipe(
        map(() => {
          const start = page * pageSize;
          return this.gifsCache.slice(start, start + pageSize);
        })
      );
    } else {
      const start = page * pageSize;
      return of(this.gifsCache.slice(start, start + pageSize));
    }
  }

  getTotalGifCount(): number {
    return this.gifsCache.length;
  }

  findGifById(id: string){
    return this.gifsCache.find(g => g.file === id);
  }

  /** Preloads GIFs into the browser cache (no extra network once cached). */
  preloadGifs(filenames: string[]): Promise<void[]> {
    return Promise.all(
      filenames.map(file => {
        const url = this.getGifUrl(file);
        return new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => reject(new Error(`Failed to preload ${file}`));
          img.src = url;
        });
      })
    );
  }

  fetchGifBlob(filename: string): Promise<Blob> {
    return fetch(this.getGifUrl(filename)).then(res => {
      if (!res.ok) throw new Error(`Failed to fetch ${filename}`);
      return res.blob();
    });
  }
}
