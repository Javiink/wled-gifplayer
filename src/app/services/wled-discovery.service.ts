import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  concat,
  defer,
  EMPTY,
  from,
  Observable,
  of
} from 'rxjs';
import {
  catchError,
  concatMap,
  filter,
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

@Injectable({ providedIn: 'root' })
export class WledDiscoveryService {
  constructor(private http: HttpClient) {}

  discover(seedIp: string | null, abort$: Observable<void>): Observable<DiscoveryEvent> {
    const foundIps = new Set<string>();

    const dedupe = (source: Observable<WledMatrixDevice>): Observable<DiscoveryEvent> =>
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
      ? dedupe(this.discoverFromSeed(normalizedSeed, abort$))
      : EMPTY;

    const subnetPhase$ = from(this.getLocalSubnets()).pipe(
      concatMap(subnets =>
        from(subnets).pipe(
          concatMap(base => this.scanSubnet(base, foundIps, abort$)),
          takeUntil(abort$)
        )
      ),
      filter(device => {
        if (foundIps.has(device.ip)) return false;
        foundIps.add(device.ip);
        return true;
      }),
      map(device => ({ kind: 'device' as const, device }))
    );

    const complete$ = defer(() => of({ kind: 'complete' as const }));

    return concat(seedPhase$, subnetPhase$, complete$).pipe(
      takeUntil(abort$),
      catchError(() => of({ kind: 'complete' as const }))
    );
  }

  private discoverFromSeed(seedIp: string, abort$: Observable<void>): Observable<WledMatrixDevice> {
    const probeSeed$ = this.probeIp(seedIp).pipe(
      filter((d): d is WledMatrixDevice => d !== null)
    );

    const probeNodes$ = this.http.get<WledNodesResponse>(`http://${seedIp}/json/nodes`).pipe(
      timeout(PROBE_TIMEOUT_MS),
      catchError(() => of({ nodes: [] } as WledNodesResponse)),
      concatMap(response => {
        const ips = (response.nodes ?? [])
          .map(n => n.ip)
          .filter(ip => !!ip && ip !== seedIp && isPrivateIp(ip));

        if (ips.length === 0) return EMPTY;

        return from(ips).pipe(
          mergeMap(ip => this.probeIp(ip), SCAN_CONCURRENCY),
          filter((d): d is WledMatrixDevice => d !== null)
        );
      })
    );

    return concat(probeSeed$, probeNodes$).pipe(takeUntil(abort$));
  }

  private scanSubnet(
    base: string,
    knownIps: Set<string>,
    abort$: Observable<void>
  ): Observable<WledMatrixDevice> {
    if (!isPrivateSubnetBase(base)) {
      return EMPTY;
    }

    const ips = Array.from({ length: 254 }, (_, i) => `${base}.${i + 1}`).filter(ip => !knownIps.has(ip));

    return from(ips).pipe(
      mergeMap(ip => this.probeIp(ip), SCAN_CONCURRENCY),
      filter((d): d is WledMatrixDevice => d !== null),
      takeUntil(abort$)
    );
  }

  private probeIp(ip: string): Observable<WledMatrixDevice | null> {
    if (!isPrivateIp(ip)) {
      return of(null);
    }

    return this.http.get<WledInfo>(`http://${ip}/json/info`).pipe(
      timeout(PROBE_TIMEOUT_MS),
      map(info => this.parseMatrixDevice(ip, info)),
      catchError(() => of(null))
    );
  }

  private parseMatrixDevice(ip: string, info: WledInfo): WledMatrixDevice | null {
    const matrix = info?.leds?.matrix;
    if (!matrix?.w || !matrix?.h) return null;

    const isWled = info.brand === 'WLED' || !!info.ver;
    if (!isWled) return null;

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
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

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
