import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class WelcomeService {
  private readonly storageKey = 'welcomeDismissed';

  shouldShow(): boolean {
    return localStorage.getItem(this.storageKey) !== 'true';
  }

  dismiss(): void {
    localStorage.setItem(this.storageKey, 'true');
  }
}
