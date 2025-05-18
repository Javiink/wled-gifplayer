import { Injectable, Injector, Type, ComponentRef } from '@angular/core';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { Subject, firstValueFrom, Subscription } from 'rxjs';
import { ModalComponent } from '../components/modal.component';

@Injectable({ providedIn: 'root' })
export class ModalService {
  constructor(private overlay: Overlay, private injector: Injector) { }

  async open<T, R = any>(component: Type<T>, data?: Partial<T>): Promise<R | undefined> {
    const overlayRef = this.overlay.create({
      hasBackdrop: true,
      backdropClass: 'bg-black/60',
      panelClass: 'modal-panel',
      disposeOnNavigation: true,
      positionStrategy: this.overlay.position().global().centerHorizontally().centerVertically()
    });

    const subject = new Subject<R|undefined>();
    const portal = new ComponentPortal(ModalComponent);
    const containerRef: ComponentRef<ModalComponent> = overlayRef.attach(portal);

    containerRef.instance.innerComponent = component;
    containerRef.instance.innerData = data;
    containerRef.instance.closeFn = (result?: R) => {
      subject.next(result!);
      subject.complete();
      overlayRef.dispose();
      backdropSub.unsubscribe();
    };

    const backdropSub: Subscription = overlayRef.backdropClick().subscribe(() => {
      subject.next(undefined);
      subject.complete();
      overlayRef.dispose();
      backdropSub.unsubscribe();
    });

    return firstValueFrom(subject);
  }
}
