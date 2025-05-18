import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-html-modal-content',
  standalone: true,
  template: `<div [innerHTML]="html"></div>`
})
export class HtmlModalContentComponent {
  @Input() html: string = '';
}
