import { Component } from '@angular/core';
import { WledService } from '../services/wled.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <p class="mb-4 text-xl"><i class="fas fa-cog"></i> Settings</p>
    <div>
      <p class="mb-2">Your WLED-based 2D matrix device IP:</p>
      <input [(ngModel)]="wledIp" placeholder="ex. 192.168.X.X" class="bg-cyan-900 border border-cyan-700 p-2 mr-2 rounded-lg">
      <button (click)="save()" class="bg-cyan-500 shadow-lg shadow-cyan-500/50 px-4 py-2 rounded cursor-pointer"><i class="fas fa-save"></i> Save</button>
    </div>
  `
})
export class SettingsComponent {
  wledIp = '';
  close!: (result?: any) => void;

  constructor(protected wledService: WledService) {
    this.wledIp = wledService.getWledIp() || '';
  }

  save(): void {
    this.wledService.setWledIp(this.wledIp);
    this.wledService.updateCurrentGif();
    if (this.close) this.close();
  }
}
