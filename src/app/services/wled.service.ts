import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, from, Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { GifService } from './gif.service';
import { ModalService } from './modal.service';
import { HtmlModalContentComponent } from '../components/html-modal-content-component';

@Injectable({ providedIn: 'root' })
export class WledService {
  private storedIpKey = 'wled_ip';
  private currentGifSubject = new BehaviorSubject<string | null>(null);
  currentGif$ = this.currentGifSubject.asObservable();

  constructor(private http: HttpClient, private gifService: GifService, private modal: ModalService) { }

  setWledIp(ip: string) {
    localStorage.setItem(this.storedIpKey, ip);
  }

  getWledIp(): string | null {
    return localStorage.getItem(this.storedIpKey);
  }

  getCurrentGif(): string {
    return this.currentGifSubject.getValue() ?? '';
  }

  updateCurrentGif(): void {
    const ip = this.getWledIp();
    if (!ip) return;
    this.http.get<any>(`http://${ip}/json/state`).pipe(
      map(state => {
        if (Array.isArray(state?.seg) && state.seg[0]?.n && state.seg[0].fx == 53) {
          return state.seg[0].n;
        }
        return null;
      }),
      catchError((error: HttpErrorResponse) => {
        if (error.status === 0 && error.statusText == "Unknown Error") {
          console.error(error);
          this.showMixedContentWarning();
        }
        return of(false);
      })
    ).subscribe(gif => this.currentGifSubject.next(gif));
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
      this.modal.open(HtmlModalContentComponent, { html: 'Configure the WLED device IP address first.' });
      return of(false);
    }

    const currentFile = this.currentGifSubject.getValue();
    if (currentFile && currentFile == filename) {
      return of(false);
    }

    const gifUrl = this.gifService.getGifUrl(filename);

    return this.uploadGif(ip, gifUrl).pipe(
      switchMap(() => {
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
          catchError(() => of(false)),
          switchMap((success) => {
            this.updateCurrentGif();
            this.deleteOldGif(ip, currentFile!).subscribe();
            return of(success);
          })
        );
      }),
    );
  }

  deleteOldGif(ip: string, filename: string): Observable<Object> {
    const formData = new FormData();
    formData.append('path', `/${filename}`);
    return this.http.request('DELETE', `http://${ip}/edit`, {body: formData, responseType: 'text'});
  }

  showMixedContentWarning() {
    const html = `
      <p class="text-2xl">Oops! 😕</p>
      <p>The request to the device was blocked by your browser. This is likely caused by the mixed-content security policy.</p>
      <p class="mt-2 text-lg">❓ What now?</p>
      <p>You can try disabling this policy clicking on the site-settings icon (on the left of the URL top bar) > Site settings > Insecure content > Allow, and then refresh the page.</p>
      <p class="mt-2 text-lg">Why is it blocked? Is it safe to allow the content?</p>
      <p>As you are loading this application from a secure HTTPS context (GitHub Pages) and it is trying to reach your WLED device in an insecure HTTP context (it does not have a SSL certificate), the browser blocks the requests the application make to the device. Disabling this feature you are allowing the application to reach your device. Is is safe in this context, but you should not be doing it everywhere if you don't know what if could affect.</p>
    `;
    return this.modal.open(HtmlModalContentComponent, { html });
  }
}

