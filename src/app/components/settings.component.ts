import { Component } from '@angular/core';
import { WledService } from '../services/wled.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="mb-6 p-4 border rounded bg-gray-50">
      <input [(ngModel)]="wledIp" placeholder="IP de WLED" class="border p-2 mr-2">
      <button (click)="save()" class="bg-green-500 text-white px-4 py-2 rounded">Guardar</button>
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
  }
}
