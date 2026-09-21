import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificacionService } from '../../core/services/notificacion.service';

@Component({
  standalone: true,
  imports: [CommonModule],
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
