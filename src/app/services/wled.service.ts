import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { from, Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { GifService } from './gif.service';

@Injectable({ providedIn: 'root' })
export class WledService {
  private storedIpKey = 'wled_ip';

  constructor(private http: HttpClient, private gifService: GifService) { }

  setWledIp(ip: string) {
    localStorage.setItem(this.storedIpKey, ip);
  }

  getWledIp(): string | null {
    return localStorage.getItem(this.storedIpKey);
  }

  isWledAvailable(ip: string): Observable<boolean> {
    return this.http.get(`http://${ip}/json/info`).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  getCurrentGif(ip: string): Observable<string | null> {
    return this.http.get<any>(`http://${ip}/json/state`).pipe(
      map(state => {
        // Verifica que seg sea un array y que el primer elemento tenga la propiedad n
        if (Array.isArray(state?.seg) && state.seg[0]?.n) {
          return state.seg[0].n;
        }
        return null;
      }),
      catchError(() => of(null))
    );
  }

  uploadGif(ip: string, gifUrl: string): Observable<Response> {
    return from(fetch(gifUrl).then(res => res.blob()).then(blob => {
      const formData = new FormData();
      formData.append('data', blob, '/'+gifUrl.split('/').pop() || 'upload.gif');
      return fetch(`http://${ip}/edit`, {
        method: 'POST',
        body: formData
      });
    }));
  }

  playGif(filename: string): Observable<boolean> {
    const ip = this.getWledIp();
    if (!ip) {
      alert('Configure the WLED device IP address first.');
      return of(false);
    }

    return this.getCurrentGif(ip).pipe(
      switchMap(currentFile => {
        console.log(currentFile);
        if (currentFile && currentFile == filename) {
          return of(false);
        }
        const gifUrl = this.gifService.getGifUrl(filename);
        console.log(filename);
        return this.uploadGif(ip, gifUrl).pipe(
          switchMap(() => this.deleteOldGif(ip, currentFile!)),
          switchMap(() => {
            console.log('switchMap2');
            const payload = {
              on: true,
              seg: {
                id: 0,
                fx: 53,
                frz: false,
                sx: 128,
                n: filename
              }
            };
            return this.http.post<void>(`http://${ip}/json/state`, payload).pipe(
              map(() => true),
              catchError(() => of(false))
            );
          })
        );
      }),
      catchError(() => of(false))
    );
  }

  deleteOldGif(ip: string, filename: string): Observable<Object> {
    const formData = new FormData();
    formData.append('path', `/${filename}`);
    return this.http.request('DELETE', `http://${ip}/edit`, {body: formData, responseType: 'text'});
  }
}

