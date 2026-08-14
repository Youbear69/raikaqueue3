import { Component, OnDestroy, OnInit } from '@angular/core';
import { WidgetCapsuleComponent } from '../shared/widget-capsule/widget-capsule.component';

@Component({
  selector: 'widget-page',
  imports: [WidgetCapsuleComponent],
  template: `<widget-capsule />`,
})
export class WidgetComponent implements OnInit, OnDestroy {
  ngOnInit(): void {
    document.body.classList.add('widget-only-body');
  }

  ngOnDestroy(): void {
    document.body.classList.remove('widget-only-body');
  }
}
