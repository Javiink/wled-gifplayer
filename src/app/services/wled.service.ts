import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, forkJoin, from, Observable, of, timer } from 'rxjs';
import { catchError, concatMap, delay, map, switchMap, tap, toArray } from 'rxjs/operators';
import { GifService } from './gif.service';
import { ModalService } from './modal.service';
import { FavoritesService } from './favorites.service';
import { PlaylistService } from './playlist.service';
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

interface DeviceFile {
  name: string;
  size: number;
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
/** Extra free space to leave after ensuring room for uploads. */
const FS_HEADROOM_BYTES = 8 * 1024;
/** Effect shown on the matrix while playlist GIFs are uploading. */
const UPLOAD_PLACEHOLDER_FX = 183;
const PRESETS_PATH = '/presets.json';
const SYSTEM_FILES = new Set([
  'presets.json',
  'cfg.json',
  'wsec.json',
  'presets.bak',
  'cfg.bak',
  'gifplayer.htm'
]);

@Injectable({ providedIn: 'root' })
export class WledService {
  private storedIpKey = 'wled_ip';
  private currentGifSubject = new BehaviorSubject<string | null>(null);
  currentGif$ = this.currentGifSubject.asObservable();

  constructor(
    private http: HttpClient,
    private gifService: GifService,
    private modal: ModalService,
    private favoritesService: FavoritesService,
    private playlistService: PlaylistService
  ) { }

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

    const protectCurrent = currentFile ? [currentFile] : [];
    return this.ensureGifOnDevice(ip, filename, protectCurrent).pipe(
      switchMap(result => {
        if (!result.ok) {
          this.modal.open(HtmlModalContentComponent, {
            html: result.reason === 'space'
              ? `<p class="mx-3">Not enough free space on the device for <strong>${filename}</strong>. Free space by removing some favorites or playlist GIFs, or delete unused files from the device.</p>`
              : `<p class="mx-3">Failed to upload <strong>${filename}</strong> to the device.</p>`
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
      tap(success => {
        if (success) {
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

    const protectExtra = orderedGifs.map(g => g.file);

    return this.setUploadPlaceholderEffect(ip).pipe(
      switchMap(() =>
        forkJoin({
          files: this.listDeviceFiles(ip),
          fs: this.getFilesystemInfo(ip)
        })
      ),
      switchMap(({ files, fs }) => {
        const onDevice = new Set(files.map(f => f.name));
        const alreadyOnDevice = orderedGifs.filter(g => onDevice.has(g.file));
        const missing = orderedGifs.filter(g => !onDevice.has(g.file));

        if (missing.length === 0) {
          return of({
            playable: orderedGifs,
            skipped: [] as GifFile[],
            toUpload: [] as GifFile[]
          });
        }

        return this.getGifSizes(missing).pipe(
          switchMap(sized => {
            const totalNeeded = sized.reduce((sum, s) => sum + s.size, 0);
            return this.ensureSpaceFor(ip, totalNeeded, protectExtra, files, fs.freeBytes).pipe(
              map(space => {
                const { fitting, skipped } = this.pickGifsThatFit(sized, space.freeBytes);
                const playableSet = new Set([
                  ...alreadyOnDevice.map(g => g.file),
                  ...fitting.map(g => g.file)
                ]);
                return {
                  playable: orderedGifs.filter(g => playableSet.has(g.file)),
                  skipped: orderedGifs.filter(g => !playableSet.has(g.file)),
                  toUpload: fitting
                };
              })
            );
          })
        );
      }),
      switchMap(({ playable, skipped, toUpload }) => {
        if (playable.length === 0) {
          this.modal.open(HtmlModalContentComponent, {
            html: '<p class="mx-3">Not enough free space on the device to play this playlist. Protected favorites and playlist GIFs may be filling storage.</p>'
          });
          return of(false);
        }

        if (skipped.length > 0) {
          const names = skipped.map(g => g.file).join(', ');
          this.modal.open(HtmlModalContentComponent, {
            html: `<p class="mx-3">Some GIFs were skipped due to limited device storage: <strong>${names}</strong>. Playing ${playable.length} of ${orderedGifs.length}.</p>`
          });
        }

        const uploadStep: Observable<GifFile[]> = toUpload.length
          ? this.uploadAllGifs(ip, toUpload)
          : of([]);

        return uploadStep.pipe(
          switchMap(uploadedGifs => {
            if (toUpload.length > 0 && uploadedGifs.length === 0) {
              const onlyMissing = playable.every(g => toUpload.some(u => u.file === g.file));
              if (onlyMissing) {
                this.modal.open(HtmlModalContentComponent, {
                  html: '<p class="mx-3">Could not upload any GIF from this playlist to the device. Please try again.</p>'
                });
                return of(false);
              }
            }

            if (toUpload.length > 0 && uploadedGifs.length < toUpload.length) {
              const failed = toUpload
                .filter(g => !uploadedGifs.some(u => u.file === g.file))
                .map(g => g.file);
              this.modal.open(HtmlModalContentComponent, {
                html: `<p class="mx-3">Some uploads failed or could not be verified on the device: <strong>${failed.join(', ')}</strong>. Continuing with available GIF(s).</p>`
              });
              const failedSet = new Set(failed);
              const surviving = playable.filter(g => !failedSet.has(g.file));
              if (surviving.length === 0) {
                return of(false);
              }
              return this.startPlaylistPlayback(ip, surviving, playlist.durationSeconds);
            }

            return this.startPlaylistPlayback(ip, playable, playlist.durationSeconds);
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

  private startPlaylistPlayback(
    ip: string,
    gifs: GifFile[],
    durationSeconds: number
  ): Observable<boolean> {
    return this.syncGifPresets(ip, gifs).pipe(
      switchMap(slots => {
        if (!slots) {
          return of(false);
        }

        const durTenths = durationSeconds * 10;
        return this.http.post<void>(`http://${ip}/json/state`, {
          on: true,
          playlist: {
            ps: slots,
            dur: slots.map(() => durTenths),
            repeat: 0,
            transition: 0
          }
        }).pipe(
          map(() => true),
          tap(() => {
            this.currentGifSubject.next(gifs[0].file);
          }),
          catchError(() => of(false))
        );
      })
    );
  }

  deleteOldGif(ip: string, filename: string): Observable<Object> {
    return this.http.request('GET', `http://${ip}/edit`, {
      params: { func: 'delete', path: encodeURI(`/${filename}`) },
      responseType: 'text'
    });
  }

  private deleteDeviceFiles(ip: string, files: string[]): Observable<void> {
    if (files.length === 0) {
      return of(undefined);
    }

    return forkJoin(
      files.map(f => this.deleteOldGif(ip, f).pipe(catchError(() => of(null))))
    ).pipe(map(() => undefined));
  }

  private getProtectedFilenames(extra: string[] = []): Set<string> {
    const protectedNames = new Set<string>(extra);
    for (const fav of this.favoritesService.getFavorites()) {
      protectedNames.add(fav.file);
    }
    for (const pl of this.playlistService.getPlaylists()) {
      for (const gif of pl.gifs) {
        protectedNames.add(gif.file);
      }
    }
    return protectedNames;
  }

  /**
   * Free enough space for bytesNeeded by deleting unprotected GIFs.
   * Uses listed file sizes to estimate freed bytes; confirms with one /json/info call after deletes.
   */
  private ensureSpaceFor(
    ip: string,
    bytesNeeded: number,
    protectExtra: string[],
    deviceFiles: DeviceFile[],
    freeBytes: number
  ): Observable<{ ok: boolean; freeBytes: number }> {
    const needed = bytesNeeded + FS_HEADROOM_BYTES;
    if (freeBytes >= needed) {
      return of({ ok: true, freeBytes });
    }

    const protectedNames = this.getProtectedFilenames(protectExtra);
    const candidates = deviceFiles
      .filter(f => this.isGifFilename(f.name) && !protectedNames.has(f.name))
      .sort((a, b) => b.size - a.size);

    let projectedFree = freeBytes;
    const toDelete: string[] = [];
    for (const file of candidates) {
      if (projectedFree >= needed) break;
      toDelete.push(file.name);
      projectedFree += file.size;
    }

    if (toDelete.length === 0) {
      return of({ ok: freeBytes >= needed, freeBytes });
    }

    return this.deleteDeviceFiles(ip, toDelete).pipe(
      switchMap(() => this.getFilesystemInfo(ip)),
      map(fs => ({
        ok: fs.freeBytes >= needed,
        freeBytes: fs.freeBytes
      }))
    );
  }

  /**
   * Ensure a GIF is present on the device: skip upload if cached, otherwise free space and upload.
   * Lists device files first; fetches filesystem info only when an upload may be needed.
   */
  private ensureGifOnDevice(
    ip: string,
    filename: string,
    protectExtra: string[] = []
  ): Observable<{ ok: boolean; reason?: 'space' | 'upload' }> {
    return this.listDeviceFiles(ip).pipe(
      switchMap(files => {
        if (files.some(f => f.name === filename)) {
          return of({ ok: true as const });
        }

        return this.getGifSize(filename).pipe(
          switchMap(size => {
            if (size <= 0) {
              return of({ ok: false as const, reason: 'upload' as const });
            }

            return this.getFilesystemInfo(ip).pipe(
              switchMap(fs =>
                this.ensureSpaceFor(ip, size, [filename, ...protectExtra], files, fs.freeBytes).pipe(
                  switchMap(space => {
                    if (!space.ok) {
                      return of({ ok: false as const, reason: 'space' as const });
                    }
                    return this.uploadGifFile(ip, filename).pipe(
                      map(result =>
                        result.ok
                          ? { ok: true as const }
                          : { ok: false as const, reason: 'upload' as const }
                      )
                    );
                  })
                )
              )
            );
          })
        );
      })
    );
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

  private getGifSizes(gifs: GifFile[]): Observable<{ gif: GifFile; size: number }[]> {
    return from(gifs).pipe(
      concatMap(gif => this.getGifSize(gif.file).pipe(map(size => ({ gif, size })))),
      toArray()
    );
  }

  private pickGifsThatFit(
    sized: { gif: GifFile; size: number }[],
    freeBytes: number
  ): { fitting: GifFile[]; skipped: GifFile[] } {
    const fitting: GifFile[] = [];
    const skipped: GifFile[] = [];
    let remaining = Math.max(0, freeBytes - FS_HEADROOM_BYTES);

    for (const { gif, size } of sized) {
      if (size > 0 && size <= remaining) {
        fitting.push(gif);
        remaining -= size;
      } else {
        skipped.push(gif);
      }
    }

    return { fitting, skipped };
  }

  /** Upload all GIFs sequentially; verify batch once at the end and retry missing files. */
  private uploadAllGifs(ip: string, gifs: GifFile[]): Observable<GifFile[]> {
    return this.uploadGifBatch(ip, gifs).pipe(
      switchMap(() => this.verifyAndRetryUploads(ip, gifs, 0))
    );
  }

  private uploadGifBatch(ip: string, gifs: GifFile[]): Observable<GifFile[]> {
    if (gifs.length === 0) {
      return of([]);
    }

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

  private verifyAndRetryUploads(
    ip: string,
    gifs: GifFile[],
    verifyAttempt: number
  ): Observable<GifFile[]> {
    return timer(UPLOAD_SETTLE_MS).pipe(
      switchMap(() => this.listDeviceFiles(ip)),
      switchMap(files => {
        const verified = gifs.filter(g => this.isGifFileOnDevice(files, g.file));
        const missing = gifs.filter(g => !this.isGifFileOnDevice(files, g.file));

        if (missing.length === 0) {
          return of(verified);
        }

        if (verifyAttempt >= UPLOAD_MAX_RETRIES) {
          console.warn(
            'Playlist upload verification failed:',
            missing.map(g => g.file)
          );
          return of(verified);
        }

        return this.uploadGifBatch(ip, missing).pipe(
          switchMap(() => this.verifyAndRetryUploads(ip, gifs, verifyAttempt + 1))
        );
      })
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
        return of({ ok: true });
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

  private isGifFileOnDevice(files: DeviceFile[], filename: string): boolean {
    return files.some(f => f.name === filename || f.name.endsWith('/' + filename));
  }

  private listDeviceFiles(ip: string): Observable<DeviceFile[]> {
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

  private parseFileList(data: unknown): DeviceFile[] {
    if (!Array.isArray(data)) return [];

    const files: DeviceFile[] = [];
    for (const entry of data) {
      if (!entry || typeof entry !== 'object' || !('name' in entry)) continue;

      const raw = entry as { name: string; size?: number; type?: string };
      if (raw.type && raw.type !== 'file') continue;

      const name = String(raw.name).replace(/^\//, '');
      if (!name || SYSTEM_FILES.has(name.toLowerCase())) continue;

      files.push({
        name,
        size: typeof raw.size === 'number' ? raw.size : 0
      });
    }
    return files;
  }

  private isGifFilename(name: string): boolean {
    return name.toLowerCase().endsWith('.gif');
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
