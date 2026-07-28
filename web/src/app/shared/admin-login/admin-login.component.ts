import { Component, inject } from '@angular/core';
import { QueueService } from '../../services/queue.service';

@Component({
  selector: 'admin-login',
  templateUrl: './admin-login.component.html',
  styleUrl: './admin-login.component.css',
})
export class AdminLoginComponent {
  readonly svc = inject(QueueService);
}
