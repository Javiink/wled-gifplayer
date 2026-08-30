import { Component, output } from '@angular/core';

@Component({
  selector: 'app-welcome-toast',
  standalone: true,
  template: `
    <div
      class="fixed z-30 inset-x-3 sm:inset-x-auto sm:right-4 sm:max-w-sm
             bottom-[max(1rem,env(safe-area-inset-bottom))]
             animate-[slideUp_0.3s_ease-out]"
      role="dialog"
      aria-labelledby="welcome-title"
      aria-describedby="welcome-desc"
    >
      <div class="relative rounded-lg p-4 sm:p-5 bg-cyan-950 ring ring-cyan-600 shadow-xl shadow-cyan-600/30">
        <button
          type="button"
          class="absolute top-2 right-2 min-w-11 min-h-11 flex items-center justify-center
                 text-gray-400 hover:text-gray-200 cursor-pointer"
          aria-label="Close"
          (click)="dismiss.emit()"
        >
          <i class="fas fa-times"></i>
        </button>

        <p id="welcome-title" class="text-xl font-semibold pr-8 mb-3">Hey there! 👋</p>

        <div id="welcome-desc" class="text-sm space-y-2 text-blue-50/90">
          <p>
            This tool will play GIF animations in your WLED-based LED 2D matrix device.
            Just configure your device IP address in the
            <i class="fas fa-cog"></i> settings and click the
            <i class="fas fa-play"></i> button in the animation you like!
          </p>
          <p>
            For this to work you need a 16x16 pixel LED matrix working with
            <a href="https://kno.wled.ge/" target="_blank" rel="noopener noreferrer" class="underline text-cyan-400">WLED</a>
            version 0.16+.
          </p>
          <p>GIF animations are updated daily.</p>
        </div>

        <div class="flex flex-col sm:flex-row gap-2 mt-4">
          <button
            type="button"
            (click)="openSettings.emit()"
            class="flex-1 px-4 py-2.5 min-h-11 bg-cyan-500 shadow-lg shadow-cyan-500/50 rounded cursor-pointer"
          >
            <i class="fas fa-cog"></i> Settings
          </button>
          <button
            type="button"
            (click)="dismiss.emit()"
            class="flex-1 px-4 py-2.5 min-h-11 bg-cyan-800 hover:bg-cyan-700 rounded cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  `,
  styles: `
    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(1rem);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `
})
export class WelcomeToastComponent {
  dismiss = output<void>();
  openSettings = output<void>();
}
