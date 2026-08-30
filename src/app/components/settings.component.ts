import { Component, OnDestroy } from '@angular/core';
import { WledService } from '../services/wled.service';
import {
  MANUAL_OPTION_VALUE,
  WledDiscoveryService,
  WledMatrixDevice
} from '../services/wled-discovery.service';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';

type SettingsMode = 'manual' | 'dropdown';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <p class="mb-4 text-xl"><i class="fas fa-cog"></i> Settings</p>
    <div class="max-w-full">
      <p class="mb-2">Your WLED-based 2D matrix device IP:</p>

      @if (mode === 'manual') {
        <div class="flex flex-wrap flex-col md:flex-row gap-2">
          <input
            [(ngModel)]="wledIp"
            placeholder="ex. 192.168.X.X"
            class="min-w-0 flex-1 bg-cyan-900 border border-cyan-700 p-2 rounded-lg"
          >
          <div class="flex flex-wrap sm:flex-nowrap gap-2">
            <button
              (click)="scan()"
              [disabled]="scanning"
              class="shrink-0 grow bg-cyan-700 shadow-lg shadow-cyan-700/50 px-3 py-2 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              @if (scanning) {
                <i class="fas fa-spinner fa-spin"></i>
              } @else {
                <i class="fas fa-search"></i>
              }
              Scan
            </button>
            <button
              (click)="save()"
              class="shrink-0 grow bg-cyan-500 shadow-lg shadow-cyan-500/50 px-4 py-2 rounded cursor-pointer"
            >
              <i class="fas fa-save"></i> Save
            </button>
          </div>
        </div>
      } @else {
        <div class="flex flex-wrap flex-col md:flex-row gap-2 max-w-full">
          <select
            [(ngModel)]="selectedIp"
            (change)="onDeviceSelected($any($event.target).value)"
            class="min-w-0 max-w-full flex-1 bg-cyan-900 border border-cyan-700 p-2 rounded-lg"
          >
            @if (devices.length === 0) {
              <option value="" disabled>Select a device…</option>
            }
            @for (device of devices; track device.ip) {
              <option [value]="device.ip">{{ formatDevice(device) }}</option>
            }
            <option [value]="manualOptionValue">Enter IP manually…</option>
          </select>
          <div class="flex flex-wrap sm:flex-nowrap gap-2">
            <button
              (click)="scan()"
              [disabled]="scanning"
              class="shrink-0 grow bg-cyan-700 shadow-lg shadow-cyan-700/50 px-3 py-2 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              @if (scanning) {
                <i class="fas fa-spinner fa-spin"></i>
              } @else {
                <i class="fas fa-search"></i>
              }
              Scan
            </button>
            <button
              (click)="save()"
              [disabled]="!selectedIp || selectedIp === manualOptionValue"
              class="shrink-0 grow bg-cyan-500 shadow-lg shadow-cyan-500/50 px-4 py-2 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i class="fas fa-save"></i> Save
            </button>
          </div>
        </div>
      }

      @if (scanning) {
        <p class="mt-2 text-sm text-cyan-300/80">
          <i class="fas fa-spinner fa-spin"></i> Scanning local network for 2D matrix devices…<br>You can speed up this process by manually setting the IP address of a known WLED device.
        </p>
      } @else if (scanCompleted && mode === 'dropdown' && devices.length === 0) {
        <p class="mt-2 text-sm text-cyan-300/80">No 2D matrix devices found. Enter an IP manually or try scanning again.</p>
      }
    </div>
  `
})
export class SettingsComponent implements OnDestroy {
  wledIp = '';
  selectedIp = '';
  devices: WledMatrixDevice[] = [];
  mode: SettingsMode = 'manual';
  scanning = false;
  scanCompleted = false;
  close!: (result?: unknown) => void;

  readonly manualOptionValue = MANUAL_OPTION_VALUE;

  private abortScan$ = new Subject<void>();
  private scanSub?: Subscription;

  constructor(
    protected wledService: WledService,
    private discovery: WledDiscoveryService
  ) {
    this.wledIp = wledService.getWledIp() || '';
  }

  ngOnDestroy(): void {
    this.stopScan();
  }

  scan(): void {
    this.stopScan();
    this.scanning = true;
    this.scanCompleted = false;
    this.mode = 'dropdown';
    this.devices = [];
    this.selectedIp = '';
    this.abortScan$ = new Subject<void>();

    const seedIp = (this.wledIp.trim() || this.wledService.getWledIp()) ?? null;

    this.scanSub = this.discovery.discover(seedIp, this.abortScan$).subscribe({
      next: event => {
        if (event.kind === 'device') {
          this.devices = [...this.devices, event.device];
          if (!this.selectedIp) {
            this.selectedIp = event.device.ip;
            this.wledIp = event.device.ip;
          }
        }
      },
      error: () => {
        this.scanning = false;
        this.scanCompleted = true;
      },
      complete: () => {
        this.scanning = false;
        this.scanCompleted = true;
        if (this.devices.length > 0 && !this.selectedIp) {
          this.selectedIp = this.devices[0].ip;
          this.wledIp = this.devices[0].ip;
        }
      }
    });
  }

  onDeviceSelected(value: string): void {
    if (value === this.manualOptionValue) {
      this.stopScan();
      this.mode = 'manual';
      this.scanCompleted = false;
      return;
    }

    this.wledIp = value;
  }

  formatDevice(device: WledMatrixDevice): string {
    return `${device.name} (${device.ip}) — ${device.width}×${device.height}`;
  }

  save(): void {
    const ip = this.mode === 'dropdown' ? this.selectedIp : this.wledIp;
    if (!ip || ip === this.manualOptionValue) return;

    this.wledService.setWledIp(ip.trim());
    this.wledService.updateCurrentGif();
    this.stopScan();
    if (this.close) this.close();
  }

  private stopScan(): void {
    this.scanSub?.unsubscribe();
    this.scanSub = undefined;
    if (!this.abortScan$.closed) {
      this.abortScan$.next();
      this.abortScan$.complete();
    }
    this.scanning = false;
  }
}
