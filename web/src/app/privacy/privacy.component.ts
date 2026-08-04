import { Component } from '@angular/core';
import { SiteBgComponent } from '../shared/site-bg/site-bg.component';
import { SiteNavComponent } from '../shared/site-nav/site-nav.component';

@Component({
  selector: 'privacy-page',
  imports: [SiteBgComponent, SiteNavComponent],
  templateUrl: './privacy.component.html',
  styleUrl: './privacy.component.css',
})
export class PrivacyComponent {}
