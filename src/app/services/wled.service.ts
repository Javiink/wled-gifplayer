import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, forkJoin, from, Observable, of, timer } from 'rxjs';
import { catchError, concatMap, delay, map, switchMap, tap, toArray } from 'rxjs/operators';
import { GifService } from './gif.service';
import { ModalService } from './modal.service';
import { HtmlModalContentComponent } from '../components/html-modal-content-component';
import {
  Playlist,
  PRESET_PREFIX,
  PRESET_SLOT_END,
  PRESET_SLOT_START
} from '../models/playlist.model';
import { GifFile } from '../models/gif.model';

interface FilesystemInfo {
  usedKb: number;
  totalKb: number;
  freeBytes: number;
}

interface WledPresetEntry {
  n?: string;
  on?: boolean;
  seg?: Record<string, unknown>[];
  [key: string]: unknown;
}

type WledPresetsFile = Record<string, WledPresetEntry>;

const UPLOAD_SETTLE_MS = 300;
const UPLOAD_MAX_RETRIES = 2;
/** Shown on the matrix while playlist GIFs are uploading. */
const UPLOAD_PLACEHOLDER_FX = 183;
const PRESETS_PATH = '/presets.json';

@Injectable({ providedIn: 'root' })
export class WledService {
  private storedIpKey = 'wled_ip';
  private currentGifSubject = new BehaviorSubject<string | null>(null);
  currentGif$ = this.currentGifSubject.asObservable();

  private activeDeviceFiles: string[] = [];

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

    return this.cleanupGifPresets(ip).pipe(
      switchMap(() => this.uploadGifFile(ip, filename)),
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
            n: filename,
            ix: 0
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

            return this.syncGifPresets(ip, uploadedGifs).pipe(
              switchMap(slots => {
                if (!slots) {
                  return of(false);
                }

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

  private fetchPresetsJson(ip: string): Observable<WledPresetsFile> {
    return this.http.get<WledPresetsFile>(`http://${ip}${PRESETS_PATH}`).pipe(
      map(data => (data && typeof data === 'object' ? { ...data } : { '0': {} })),
      catchError(() => of({ '0': {} } as WledPresetsFile))
    );
  }

  private uploadPresetsJson(ip: string, presets: WledPresetsFile): Observable<boolean> {
    const blob = new Blob([JSON.stringify(presets)], { type: 'application/json' });
    const formData = new FormData();
    formData.append('data', blob, PRESETS_PATH);

    return from(
      fetch(`http://${ip}/upload`, {
        method: 'POST',
        body: formData
      })
    ).pipe(
      switchMap(response =>
        from(response.text()).pipe(
          map(text => ({ response, text }))
        )
      ),
      map(({ response, text }) => {
        const ok = response.ok && /UPLOADED/i.test(text);
        if (!ok) {
          console.warn('presets.json upload failed:', response.status, text);
        }
        return ok;
      }),
      catchError(err => {
        console.warn('presets.json upload error:', err);
        return of(false);
      })
    );
  }

  private removeGifplPresets(presets: WledPresetsFile): WledPresetsFile {
    const result: WledPresetsFile = { ...presets };
    for (const key of Object.keys(result)) {
      const entry = result[key];
      const name = typeof entry?.n === 'string' ? entry.n : '';
      if (name.startsWith(PRESET_PREFIX)) {
        delete result[key];
      }
    }
    return result;
  }

  private isSlotFree(presets: WledPresetsFile, slot: number): boolean {
    const entry = presets[String(slot)];
    if (entry == null) return true;
    return Object.keys(entry).length === 0;
  }

  private countFreeSlots(presets: WledPresetsFile): number {
    let free = 0;
    for (let slot = PRESET_SLOT_START; slot <= PRESET_SLOT_END; slot++) {
      if (this.isSlotFree(presets, slot)) {
        free++;
      }
    }
    return free;
  }

  private assignPresetSlots(presets: WledPresetsFile, count: number): number[] {
    const slots: number[] = [];
    for (let slot = PRESET_SLOT_START; slot <= PRESET_SLOT_END && slots.length < count; slot++) {
      if (this.isSlotFree(presets, slot)) {
        slots.push(slot);
      }
    }
    return slots;
  }

  private buildGifPreset(
    filename: string,
    slot: number,
    segTemplate: Record<string, unknown> | null
  ): WledPresetEntry {
    const seg: Record<string, unknown> = {
      id: 0,
      fx: 53,
      frz: false,
      sx: 128,
      ix: 0,
      n: filename
    };

    if (segTemplate) {
      if (typeof segTemplate['start'] === 'number') seg['start'] = segTemplate['start'];
      if (typeof segTemplate['stop'] === 'number') seg['stop'] = segTemplate['stop'];
      if (typeof segTemplate['len'] === 'number') seg['len'] = segTemplate['len'];
    }

    return {
      n: `${PRESET_PREFIX}${slot}`,
      on: true,
      seg: [seg]
    };
  }

  private getSegment0Template(ip: string): Observable<Record<string, unknown> | null> {
    return this.http.get<any>(`http://${ip}/json/state`).pipe(
      map(state => {
        const seg = Array.isArray(state?.seg) ? state.seg[0] : null;
        return seg && typeof seg === 'object' ? seg as Record<string, unknown> : null;
      }),
      catchError(() => of(null))
    );
  }

  /**
   * Sync gifpl-* presets into presets.json without activating each GIF.
   * Returns slot IDs on success, or null if aborted (not enough slots / upload failed).
   */
  private syncGifPresets(ip: string, gifs: GifFile[]): Observable<number[] | null> {
    return this.fetchPresetsJson(ip).pipe(
      switchMap(presets => {
        const cleaned = this.removeGifplPresets(presets);
        const freeSlots = this.countFreeSlots(cleaned);

        if (freeSlots < gifs.length) {
          this.modal.open(HtmlModalContentComponent, {
            html: '<p class="mx-3">Cannot play this playlist: not enough free preset slots on the WLED device. Free some presets (or reduce playlist size) and try again.</p>'
          });
          return of(null);
        }

        return this.getSegment0Template(ip).pipe(
          switchMap(segTemplate => {
            const slots = this.assignPresetSlots(cleaned, gifs.length);
            const next: WledPresetsFile = { ...cleaned };

            gifs.forEach((gif, index) => {
              const slot = slots[index];
              next[String(slot)] = this.buildGifPreset(gif.file, slot, segTemplate);
            });

            return this.uploadPresetsJson(ip, next).pipe(
              map(ok => {
                if (!ok) {
                  this.modal.open(HtmlModalContentComponent, {
                    html: '<p class="mx-3">Failed to update presets on the WLED device. Please try again.</p>'
                  });
                  return null;
                }
                return slots;
              })
            );
          })
        );
      })
    );
  }

  /** Remove all gifpl-* presets from the device without creating new ones. */
  private cleanupGifPresets(ip: string): Observable<void> {
    return this.fetchPresetsJson(ip).pipe(
      switchMap(presets => {
        const cleaned = this.removeGifplPresets(presets);
        const hadGifpl = Object.keys(presets).some(key => {
          const name = typeof presets[key]?.n === 'string' ? presets[key].n! : '';
          return name.startsWith(PRESET_PREFIX);
        });

        if (!hadGifpl) {
          return of(undefined);
        }

        return this.uploadPresetsJson(ip, cleaned).pipe(
          map(() => undefined),
          catchError(() => of(undefined))
        );
      }),
      catchError(() => of(undefined))
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
