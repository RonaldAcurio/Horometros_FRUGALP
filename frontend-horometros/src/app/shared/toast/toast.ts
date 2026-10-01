import { Component, inject } from '@angular/core';

import { NotificacionService } from '../../core/services/notificacion.service';

@Component({
  standalone: true,
  imports: [],
  selector: 'app-toast',
  styleUrl: './toast.css',
  templateUrl: './toast.html',
})
export class Toast {
  protected notificacionService = inject(NotificacionService);

  cerrar(): void {
    this.notificacionService.cerrar();
  }
}
