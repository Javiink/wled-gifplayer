import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, forkJoin, from, Observable, of, timer } from 'rxjs';
import { catchError, concatMap, delay, map, switchMap, tap, toArray } from 'rxjs/operators';
import { GifService } from './gif.service';
import { ModalService } from './modal.service';
import { HtmlModalContentComponent } from '../components/html-modal-content-component';
import { Playlist } from '../models/playlist.model';
import { GifFile } from '../models/gif.model';

interface FilesystemInfo {
  usedKb: number;
  totalKb: number;
  freeBytes: number;
}

const UPLOAD_SETTLE_MS = 300;
const UPLOAD_MAX_RETRIES = 2;
/** Shown on the matrix while playlist GIFs are uploading. */
const UPLOAD_PLACEHOLDER_FX = 183;

@Injectable({ providedIn: 'root' })
export class WledService {
  private storedIpKey = 'wled_ip';
  private currentGifSubject = new BehaviorSubject<string | null>(null);
  currentGif$ = this.currentGifSubject.asObservable();

  private activeDeviceFiles: string[] = [];
  private readonly PRESET_SLOT_START = 201;

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
        return of(null);
      })
    ).subscribe(gif => this.currentGifSubject.next(gif));
  }

  playGif(filename: string): Observable<boolean> {
    const ip = this.getWledIp();
    if (!ip) {
      this.modal.open(HtmlModalContentComponent, { html: '<p class="mx-3">Configure the WLED device IP address in <i class="fas fa-cog"></i> Settings first.</p> ' });
      return of(false);
    }

    const currentFile = this.currentGifSubject.getValue();
    if (currentFile && currentFile === filename) {
      return of(false);
    }

    const previousFiles = [...this.activeDeviceFiles];

    return this.uploadGifFile(ip, filename).pipe(
      switchMap(result => {
        if (!result.ok) {
          this.modal.open(HtmlModalContentComponent, {
            html: `<p class="mx-3">Failed to upload <strong>${filename}</strong> to the device.</p>`
          });
          return of(false);
        }
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
      }),
      switchMap(success => {
        if (!success) {
          return of(false);
        }
        const filesToDelete = previousFiles.filter(f => f !== filename);
        return this.deleteDeviceFiles(filesToDelete).pipe(map(() => true));
      }),
      tap(success => {
        if (success) {
          this.activeDeviceFiles = [filename];
          this.updateCurrentGif();
        }
      })
    );
  }

  playPlaylist(playlist: Playlist): Observable<boolean> {
    const ip = this.getWledIp();
    if (!ip) {
      this.modal.open(HtmlModalContentComponent, { html: '<p class="mx-3">Configure the WLED device IP address in <i class="fas fa-cog"></i> Settings first.</p> ' });
      return of(false);
    }

    if (!playlist.gifs.length) {
      return of(false);
    }

    const orderedGifs = playlist.randomize
      ? this.shuffle([...playlist.gifs])
      : [...playlist.gifs];

    const previousFiles = [...this.activeDeviceFiles];

    return this.setUploadPlaceholderEffect(ip).pipe(
      switchMap(() => this.getFilesystemInfo(ip)),
      switchMap(fs => this.selectGifsThatFit(orderedGifs, fs.freeBytes)),
      switchMap(({ gifs: toUpload, skipped }) => {
        if (toUpload.length === 0) {
          this.modal.open(HtmlModalContentComponent, {
            html: '<p class="mx-3">Not enough free space on the device to upload any GIF from this playlist.</p>'
          });
          return of(false);
        }

        if (skipped.length > 0) {
          const names = skipped.map(g => g.file).join(', ');
          this.modal.open(HtmlModalContentComponent, {
            html: `<p class="mx-3">Some GIFs were skipped due to limited device storage: <strong>${names}</strong>. Playing ${toUpload.length} of ${orderedGifs.length}.</p>`
          });
        }

        return this.uploadAllGifs(ip, toUpload).pipe(
          switchMap(uploadedGifs => {
            if (uploadedGifs.length === 0) {
              this.modal.open(HtmlModalContentComponent, {
                html: '<p class="mx-3">Could not upload any GIF from this playlist to the device. Please try again.</p>'
              });
              return of(false);
            }

            if (uploadedGifs.length < toUpload.length) {
              const failed = toUpload
                .filter(g => !uploadedGifs.some(u => u.file === g.file))
                .map(g => g.file)
                .join(', ');
              this.modal.open(HtmlModalContentComponent, {
                html: `<p class="mx-3">Some uploads failed or could not be verified on the device: <strong>${failed}</strong>. Continuing with ${uploadedGifs.length} GIF(s).</p>`
              });
            }

            return this.saveAllPresets(ip, uploadedGifs).pipe(
              switchMap(slots => {
                const durTenths = playlist.durationSeconds * 10;
                return this.http.post<void>(`http://${ip}/json/state`, {
                  on: true,
                  playlist: {
                    ps: slots,
                    dur: slots.map(() => durTenths),
                    repeat: 0,
                    transition: 0
                  }
                }).pipe(
                  switchMap(() => {
                    const newFiles = uploadedGifs.map(g => g.file);
                    const filesToDelete = previousFiles.filter(f => !newFiles.includes(f));
                    return this.deleteDeviceFiles(filesToDelete).pipe(
                      map(() => true),
                      tap(() => {
                        this.activeDeviceFiles = newFiles;
                        this.currentGifSubject.next(newFiles[0]);
                      })
                    );
                  }),
                  catchError(() => of(false))
                );
              })
            );
          })
        );
      }),
      catchError((error: HttpErrorResponse) => {
        if (error.status === 0 && error.statusText === 'Unknown Error') {
          this.showMixedContentWarning();
        }
        return of(false);
      })
    );
  }

  deleteOldGif(ip: string, filename: string): Observable<Object> {
    const formData = new FormData();
    formData.append('path', `/${filename}`);
    return this.http.request('GET', `http://${ip}/edit`, {
      params: { func: 'delete', path: encodeURI(`/${filename}`) },
      responseType: "text"
    });
  }

  private deleteDeviceFiles(files: string[]): Observable<void> {
    const ip = this.getWledIp();
    if (!ip || files.length === 0) {
      return of(undefined);
    }

    return forkJoin(
      files.map(f => this.deleteOldGif(ip, f).pipe(catchError(() => of(null))))
    ).pipe(map(() => undefined));
  }

  private getFilesystemInfo(ip: string): Observable<FilesystemInfo> {
    return this.http.get<any>(`http://${ip}/json/info`).pipe(
      map(info => {
        const usedKb = info.fs?.u ?? 0;
        const totalKb = info.fs?.t ?? 0;
        return {
          usedKb,
          totalKb,
          freeBytes: Math.max(0, (totalKb - usedKb) * 1024)
        };
      }),
      catchError((error: HttpErrorResponse) => {
        if (error.status === 0 && error.statusText === 'Unknown Error') {
          this.showMixedContentWarning();
        }
        return of({ usedKb: 0, totalKb: 0, freeBytes: 0 });
      })
    );
  }

  private getGifSize(filename: string): Observable<number> {
    return from(
      this.gifService.fetchGifBlob(filename)
        .then(blob => blob.size)
        .catch(() => 0)
    );
  }

  private selectGifsThatFit(gifs: GifFile[], freeBytes: number): Observable<{ gifs: GifFile[]; skipped: GifFile[] }> {
    return from(gifs).pipe(
      concatMap(gif =>
        this.getGifSize(gif.file).pipe(map(size => ({ gif, size })))
      ),
      toArray(),
      map(items => {
        const fitting: GifFile[] = [];
        const skipped: GifFile[] = [];
        let remaining = freeBytes;

        for (const { gif, size } of items) {
          if (size > 0 && size <= remaining) {
            fitting.push(gif);
            remaining -= size;
          } else {
            skipped.push(gif);
          }
        }

        return { gifs: fitting, skipped };
      })
    );
  }

  /** Upload all GIFs sequentially; matrix stays on upload placeholder effect. */
  private uploadAllGifs(ip: string, gifs: GifFile[]): Observable<GifFile[]> {
    return from(gifs).pipe(
      concatMap(gif =>
        this.uploadGifFile(ip, gif.file).pipe(
          switchMap(result => {
            if (result.ok) {
              return of(gif).pipe(delay(UPLOAD_SETTLE_MS));
            }
            return of(null);
          })
        )
      ),
      toArray(),
      map(results => results.filter((g): g is GifFile => g !== null))
    );
  }

  /** Save presets; matrix stays on upload placeholder between each save. */
  private saveAllPresets(ip: string, gifs: GifFile[]): Observable<number[]> {
    return from(gifs).pipe(
      concatMap((gif, index) => {
        const slot = this.PRESET_SLOT_START + index;
        return this.savePresetQuiet(ip, gif.file, slot).pipe(
          map(ok => (ok ? slot : -1))
        );
      }),
      toArray(),
      map(slots => slots.filter(s => s >= 0))
    );
  }

  private uploadGifFile(ip: string, filename: string, attempt = 0): Observable<{ ok: boolean }> {
    return from(
      this.gifService.fetchGifBlob(filename).then(blob => {
        const formData = new FormData();
        formData.append('data', blob, '/' + filename);
        return fetch(`http://${ip}/upload`, {
          method: 'POST',
          body: formData
        });
      })
    ).pipe(
      switchMap(response =>
        from(response.text()).pipe(
          map(text => ({ response, text }))
        )
      ),
      switchMap(({ response, text }) => {
        const uploaded = response.ok && /UPLOADED/i.test(text);
        if (!uploaded) {
          if (attempt < UPLOAD_MAX_RETRIES) {
            return timer(500).pipe(
              switchMap(() => this.uploadGifFile(ip, filename, attempt + 1))
            );
          }
          console.warn(`Upload failed for ${filename}:`, response.status, text);
          return of({ ok: false });
        }
        return timer(UPLOAD_SETTLE_MS).pipe(
          switchMap(() => this.verifyFileOnDevice(ip, filename)),
          switchMap(exists => {
            if (!exists && attempt < UPLOAD_MAX_RETRIES) {
              return timer(500).pipe(
                switchMap(() => this.uploadGifFile(ip, filename, attempt + 1))
              );
            }
            if (!exists) {
              console.warn(`Upload reported success but file not found: ${filename}`);
            }
            return of({ ok: exists });
          })
        );
      }),
      catchError(err => {
        console.warn(`Upload error for ${filename}:`, err);
        if (attempt < UPLOAD_MAX_RETRIES) {
          return timer(500).pipe(
            switchMap(() => this.uploadGifFile(ip, filename, attempt + 1))
          );
        }
        return of({ ok: false });
      })
    );
  }

  private verifyFileOnDevice(ip: string, filename: string): Observable<boolean> {
    return this.listDeviceFiles(ip).pipe(
      map(files => files.some(f => f === filename || f.endsWith('/' + filename) || f.endsWith(filename)))
    );
  }

  private listDeviceFiles(ip: string): Observable<string[]> {
    return this.http.get<unknown>(`http://${ip}/edit`, {
      params: { list: '/' },
      responseType: 'json' as 'json'
    }).pipe(
      map(data => this.parseFileList(data)),
      catchError(() =>
        this.http.get(`http://${ip}/edit?list=/`, { responseType: 'text' }).pipe(
          map(text => {
            try {
              return this.parseFileList(JSON.parse(text));
            } catch {
              return [];
            }
          }),
          catchError(() => of([]))
        )
      )
    );
  }

  private parseFileList(data: unknown): string[] {
    if (!Array.isArray(data)) return [];
    return data.map(entry => {
      if (typeof entry === 'string') return entry.replace(/^\//, '');
      if (entry && typeof entry === 'object' && 'name' in entry) {
        return String((entry as { name: string }).name).replace(/^\//, '');
      }
      return '';
    }).filter(Boolean);
  }

  /** Save preset from current GIF segment state, then restore upload placeholder on the matrix. */
  private savePresetQuiet(ip: string, filename: string, slot: number): Observable<boolean> {
    return this.http.post<void>(`http://${ip}/json/state`, {
      on: true,
      seg: [{ id: 0, fx: 53, frz: false, sx: 128, n: filename }]
    }).pipe(
      switchMap(() =>
        this.http.post<void>(`http://${ip}/json/state`, {
          psave: slot,
          n: `gifpl-${slot}`,
          ib: true,
          sb: true
        })
      ),
      switchMap(() => this.setUploadPlaceholderEffect(ip)),
      map(() => true),
      catchError(() => of(false))
    );
  }

  private setUploadPlaceholderEffect(ip: string): Observable<void> {
    return this.http.post<void>(`http://${ip}/json/state`, {
      on: true,
      seg: [{ id: 0, fx: UPLOAD_PLACEHOLDER_FX }]
    }).pipe(
      map(() => undefined),
      catchError(() => of(undefined))
    );
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  showMixedContentWarning() {
    const html = `
      <p class="text-2xl">Oops! 😕</p>
      <p>The request couldn't reach your device. Please double-check that the IP address is correct and your device is reachable. If you keep receiving this error, it is likely caused by the mixed-content security policy.</p>
      <p class="mt-2 text-lg">❓ What now?</p>
      <p>You can try disabling this policy clicking on the site-settings icon (on the left of the URL top bar) > Site settings > Insecure content > Allow, and then refresh the page.</p>
      <p class="mt-2 text-lg">Why is it blocked? Is it safe to allow the content?</p>
      <p>As you are loading this application from a secure HTTPS context (GitHub Pages) and it is trying to reach your WLED device in an insecure HTTP context (it does not have a SSL certificate), the browser blocks the requests the application make to the device. Disabling this feature you are allowing the application to reach your device. Is is safe in this context, but you should not be doing it everywhere if you don't know what if could affect.</p>
    `;
    return this.modal.open(HtmlModalContentComponent, { html });
  }
}
