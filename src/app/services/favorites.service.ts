import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { GifFile } from '../models/gif.model';

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly storageKey = 'favorites';
  private favoritesSubject = new BehaviorSubject<GifFile[]>(this.loadFavorites());
  favorites$ = this.favoritesSubject.asObservable();

  private loadFavorites(): GifFile[] {
    return JSON.parse(localStorage.getItem(this.storageKey) || '[]');
  }

  private saveFavorites(favorites: GifFile[]) {
    localStorage.setItem(this.storageKey, JSON.stringify(favorites));
    this.favoritesSubject.next(favorites);
  }

  getFavorites(): GifFile[] {
    return this.favoritesSubject.getValue();
  }

  isFavorite(gif: GifFile): boolean {
    return this.getFavorites().some(f => f.file === gif.file);
  }

  addFavorite(gif: GifFile): void {
    if (!this.isFavorite(gif)) {
      const updated = [...this.getFavorites(), gif];
      this.saveFavorites(updated);
    }
  }

  removeFavorite(gif: GifFile): void {
    const updated = this.getFavorites().filter(f => f.file !== gif.file);
    this.saveFavorites(updated);
  }

  toggleFavorite(gif: GifFile): void {
    if (this.isFavorite(gif)) {
      this.removeFavorite(gif);
    } else {
      this.addFavorite(gif);
    }
  }
}
