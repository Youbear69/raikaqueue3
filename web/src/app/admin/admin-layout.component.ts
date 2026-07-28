import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AdminLoginComponent } from '../shared/admin-login/admin-login.component';
import { SiteBgComponent } from '../shared/site-bg/site-bg.component';
import { SiteNavComponent } from '../shared/site-nav/site-nav.component';
import { QueueService } from '../services/queue.service';

@Component({
  selector: 'admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AdminLoginComponent, SiteBgComponent, SiteNavComponent],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.css',
})
export class AdminLayoutComponent {
  readonly svc = inject(QueueService);
}
