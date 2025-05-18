import { Component } from '@angular/core';
import { WledService } from '../services/wled.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="mb-6 p-4 border rounded ">
      <input [(ngModel)]="wledIp" placeholder="WLED device IP" class="border p-2 mr-2 rounded">
      <button (click)="save()" class="bg-cyan-500 shadow-lg shadow-cyan-500/50 px-4 py-2 rounded cursor-pointer"><i class="fas fa-save"></i> Save</button>
    </div>
  `
})
export class SettingsComponent {
  wledIp = '';

  constructor(protected wledService: WledService) {
    this.wledIp = wledService.getWledIp() || '';
  }

  save(): void {
    this.wledService.setWledIp(this.wledIp);
    this.wledService.updateCurrentGif();
  }
}
