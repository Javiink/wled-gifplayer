import { Component, ViewChild, ViewContainerRef, ComponentRef, Type, AfterViewInit, Input } from '@angular/core';

@Component({
  selector: 'app-modal',
  standalone: true,
  template: `
    <div class="relative p-5 inset-0 flex items-center justify-center z-50">
      <div class="relative rounded p-6 sm:max-w-3xl bg-cyan-950 ring ring-cyan-600 shadow-xl shadow-cyan-600/50">
        <button class="absolute top-1.5 right-1.5 p-1 aspect-square border border-gray-400 rounded-full leading-0 cursor-pointer" (click)="closeModal()"><i class="fas fa-times text-gray-400 leading-0!"></i></button>
        <ng-template #modalContent></ng-template>
      </div>
    </div>
  `
})
export class ModalComponent implements AfterViewInit {
  @ViewChild('modalContent', { read: ViewContainerRef, static: true }) modalContent!: ViewContainerRef;
  @Input() innerComponent!: Type<any>;
  @Input() innerData?: any;
  @Input() closeFn!: (result?: any) => void;

  private innerComponentRef?: ComponentRef<any>;

  ngAfterViewInit() {
    this.modalContent.clear();
    this.innerComponentRef = this.modalContent.createComponent(this.innerComponent);
    if (this.innerData) {
      Object.assign(this.innerComponentRef.instance, this.innerData);
    }
    (this.innerComponentRef.instance as any).close = (result?: any) => this.closeModal(result);
  }

  closeModal(result?: any) {
    if (this.closeFn) this.closeFn(result);
  }
}
