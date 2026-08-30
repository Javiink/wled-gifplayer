import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  concat,
  defer,
  EMPTY,
  from,
  merge,
  Observable,
  of,
  Subject
} from 'rxjs';
import {
  catchError,
  concatMap,
  filter,
  finalize,
  map,
  mergeMap,
  takeUntil,
  timeout
} from 'rxjs/operators';

export interface WledMatrixDevice {
  ip: string;
  name: string;
  width: number;
  height: number;
  version: string;
}

export type DiscoveryEvent =
  | { kind: 'device'; device: WledMatrixDevice }
  | { kind: 'complete' };

interface WledInfo {
  name?: string;
  ver?: string;
  brand?: string;
  leds?: {
    matrix?: {
      w?: number;
      h?: number;
    };
  };
}

interface WledNode {
  ip: string;
  name?: string;
}

interface WledNodesResponse {
  nodes?: WledNode[];
}

interface DiscoveryContext {
  foundIps: Set<string>;
  nodesLookupSucceeded: boolean;
  nodesLookupInProgress: boolean;
  triedNodeSeeds: Set<string>;
  pendingNodeSeeds: string[];
  nodesSubject: Subject<WledMatrixDevice>;
}

const PROBE_TIMEOUT_MS = 1500;
const SCAN_CONCURRENCY = 10;
const WEBRTC_TIMEOUT_MS = 2000;
const FALLBACK_SUBNETS = ['192.168.1', '192.168.0', '10.0.0', '10.0.1', '172.16.0'];
const MANUAL_OPTION_VALUE = '__manual__';

export { MANUAL_OPTION_VALUE };

function isPrivateIp(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function subnetFromPrivateIp(ip: string): string | null {
  if (!isPrivateIp(ip)) return null;
  const parts = ip.split('.');
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

function isPrivateSubnetBase(base: string): boolean {
  return subnetFromPrivateIp(`${base}.1`) !== null;
}

function createDiscoveryContext(foundIps: Set<string>): DiscoveryContext {
  return {
    foundIps,
    nodesLookupSucceeded: false,
    nodesLookupInProgress: false,
    triedNodeSeeds: new Set(),
    pendingNodeSeeds: [],
    nodesSubject: new Subject<WledMatrixDevice>()
  };
}

@Injectable({ providedIn: 'root' })
export class WledDiscoveryService {
  constructor(private http: HttpClient) {}

  discover(seedIp: string | null, abort$: Observable<void>): Observable<DiscoveryEvent> {
    const foundIps = new Set<string>();
    const ctx = createDiscoveryContext(foundIps);

    const toEvents = (source: Observable<WledMatrixDevice>): Observable<DiscoveryEvent> =>
      source.pipe(
        filter(device => {
          if (foundIps.has(device.ip)) return false;
          foundIps.add(device.ip);
          return true;
        }),
        map(device => ({ kind: 'device' as const, device }))
      );

    const normalizedSeed = seedIp && isPrivateIp(seedIp) ? seedIp : null;

    const seedPhase$ = normalizedSeed
      ? toEvents(this.discoverFromSeed(normalizedSeed, ctx, abort$))
      : EMPTY;

    const subnetScan$ = from(this.getLocalSubnets()).pipe(
      concatMap(subnets =>
        from(subnets).pipe(
          concatMap(base => this.scanSubnet(base, ctx, abort$)),
          takeUntil(abort$)
        )
      ),
      finalize(() => ctx.nodesSubject.complete())
    );

    const subnetPhase$ = toEvents(
      merge(subnetScan$, ctx.nodesSubject.asObservable()).pipe(takeUntil(abort$))
    );

    const complete$ = defer(() => of({ kind: 'complete' as const }));

    return concat(seedPhase$, subnetPhase$, complete$).pipe(
      takeUntil(abort$),
      catchError(() => of({ kind: 'complete' as const }))
    );
  }

  /** Saved-IP phase: probe seed, then /json/nodes (counts as the one nodes lookup). */
  private discoverFromSeed(
    seedIp: string,
    ctx: DiscoveryContext,
    abort$: Observable<void>
  ): Observable<WledMatrixDevice> {
    ctx.triedNodeSeeds.add(seedIp);
    ctx.nodesLookupInProgress = true;

    const probeSeed$ = this.probeWledInfo(seedIp).pipe(
      concatMap(info => {
        if (!info) return EMPTY;
        const matrix = this.parseMatrixDevice(seedIp, info);
        return matrix ? of(matrix) : EMPTY;
      })
    );

    const probeNodes$ = this.queryNodesForMatrixDevices(seedIp, ctx).pipe(
      finalize(() => {
        ctx.nodesLookupInProgress = false;
        this.tryNextPendingNodeSeed(ctx, abort$);
      })
    );

    return merge(probeSeed$, probeNodes$).pipe(takeUntil(abort$));
  }

  private scanSubnet(
    base: string,
    ctx: DiscoveryContext,
    abort$: Observable<void>
  ): Observable<WledMatrixDevice> {
    if (!isPrivateSubnetBase(base)) {
      return EMPTY;
    }

    const ips = Array.from({ length: 254 }, (_, i) => `${base}.${i + 1}`).filter(
      ip => !ctx.foundIps.has(ip)
    );

    return from(ips).pipe(
      mergeMap(
        ip =>
          this.probeWledInfo(ip).pipe(
            concatMap(info => {
              if (!info) return EMPTY;

              this.scheduleNodesLookup(ip, ctx, abort$);

              const matrix = this.parseMatrixDevice(ip, info);
              return matrix ? of(matrix) : EMPTY;
            })
          ),
        SCAN_CONCURRENCY
      ),
      takeUntil(abort$)
    );
  }

  /**
   * Attempt /json/nodes on the first WLED found during scanning.
   * If it fails (HTTP error or empty list), the next WLED found is tried, and so on.
   * Only one successful nodes query runs per discovery session.
   */
  private scheduleNodesLookup(seedIp: string, ctx: DiscoveryContext, abort$: Observable<void>): void {
    if (ctx.nodesLookupSucceeded) return;

    if (ctx.nodesLookupInProgress) {
      if (!ctx.triedNodeSeeds.has(seedIp) && !ctx.pendingNodeSeeds.includes(seedIp)) {
        ctx.pendingNodeSeeds.push(seedIp);
      }
      return;
    }

    if (ctx.triedNodeSeeds.has(seedIp)) return;

    ctx.triedNodeSeeds.add(seedIp);
    ctx.nodesLookupInProgress = true;

    this.queryNodesForMatrixDevices(seedIp, ctx)
      .pipe(
        finalize(() => {
          ctx.nodesLookupInProgress = false;
          this.tryNextPendingNodeSeed(ctx, abort$);
        }),
        takeUntil(abort$)
      )
      .subscribe({
        next: device => ctx.nodesSubject.next(device),
        error: () => undefined
      });
  }

  private tryNextPendingNodeSeed(ctx: DiscoveryContext, abort$: Observable<void>): void {
    if (ctx.nodesLookupSucceeded) {
      ctx.pendingNodeSeeds.length = 0;
      return;
    }

    while (ctx.pendingNodeSeeds.length > 0) {
      const next = ctx.pendingNodeSeeds.shift()!;
      if (!ctx.triedNodeSeeds.has(next)) {
        this.scheduleNodesLookup(next, ctx, abort$);
        return;
      }
    }
  }

  private queryNodesForMatrixDevices(
    seedIp: string,
    ctx: DiscoveryContext
  ): Observable<WledMatrixDevice> {
    return this.http.get<WledNodesResponse>(`http://${seedIp}/json/nodes`).pipe(
      timeout(PROBE_TIMEOUT_MS),
      catchError(() => of(null)),
      concatMap(response => {
        if (!response) return EMPTY;

        const ips = (response.nodes ?? [])
          .map(n => n.ip)
          .filter(ip => !!ip && ip !== seedIp && isPrivateIp(ip) && !ctx.foundIps.has(ip));

        if (ips.length === 0) return EMPTY;

        ctx.nodesLookupSucceeded = true;
        ctx.pendingNodeSeeds.length = 0;

        return from(ips).pipe(
          mergeMap(ip => this.probeMatrixDevice(ip), SCAN_CONCURRENCY),
          filter((d): d is WledMatrixDevice => d !== null)
        );
      })
    );
  }

  private probeMatrixDevice(ip: string): Observable<WledMatrixDevice | null> {
    return this.probeWledInfo(ip).pipe(
      map(info => (info ? this.parseMatrixDevice(ip, info) : null))
    );
  }

  private probeWledInfo(ip: string): Observable<WledInfo | null> {
    if (!isPrivateIp(ip)) {
      return of(null);
    }

    return this.http.get<WledInfo>(`http://${ip}/json/info`).pipe(
      timeout(PROBE_TIMEOUT_MS),
      map(info => (this.isWledDevice(info) ? info : null)),
      catchError(() => of(null))
    );
  }

  private isWledDevice(info: WledInfo): boolean {
    return info?.brand === 'WLED' || !!info?.ver;
  }

  private parseMatrixDevice(ip: string, info: WledInfo): WledMatrixDevice | null {
    const matrix = info?.leds?.matrix;
    if (!matrix?.w || !matrix?.h) return null;

    if (!this.isWledDevice(info)) return null;

    return {
      ip,
      name: info.name?.trim() || 'WLED',
      width: matrix.w,
      height: matrix.h,
      version: info.ver ?? ''
    };
  }

  private getLocalSubnets(): Promise<string[]> {
    return new Promise(resolve => {
      const subnets = new Set<string>();

      if (typeof RTCPeerConnection === 'undefined') {
        resolve([...FALLBACK_SUBNETS]);
        return;
      }

      let settled = false;
      const pc = new RTCPeerConnection({ iceServers: [] });

      const finish = () => {
        if (settled) return;
        settled = true;
        pc.close();
        resolve(subnets.size > 0 ? [...subnets] : [...FALLBACK_SUBNETS]);
      };

      pc.createDataChannel('discovery');
      pc.onicecandidate = event => {
        if (!event.candidate) {
          finish();
          return;
        }

        const candidate = event.candidate.candidate;
        const ipMatch = /(\d+\.\d+\.\d+\.\d+)/.exec(candidate);
        if (!ipMatch) return;

        const subnet = subnetFromPrivateIp(ipMatch[1]);
        if (subnet) {
          subnets.add(subnet);
        }
      };

      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .catch(() => finish());

      setTimeout(finish, WEBRTC_TIMEOUT_MS);
    });
  }
}
