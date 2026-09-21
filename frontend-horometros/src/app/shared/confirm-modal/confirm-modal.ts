import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmacionService } from '../../core/services/confirmacion.service';

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-confirm-modal',
  styleUrl: './confirm-modal.css',
  templateUrl: './confirm-modal.html',
})
export class ConfirmModal {
  protected confirmacionService = inject(ConfirmacionService);

  responder(respuesta: boolean): void {
    this.confirmacionService.responder(respuesta);
  }
}
