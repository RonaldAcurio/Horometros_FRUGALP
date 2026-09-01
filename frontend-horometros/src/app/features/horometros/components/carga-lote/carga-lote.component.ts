import { Component, inject, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RespuestaLote } from '../../../../core/models/horometro.model';
import { HorometrosService } from '../../../../core/services/horometros.services';

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-carga-lote',
  styleUrl: './carga-lote.component.css',
  templateUrl: './carga-lote.component.html',
})
export class CargaLoteComponent {

  private horometrosService = inject(HorometrosService);
  private cdr = inject(ChangeDetectorRef);

  @Output() loteProcesado = new EventEmitter<RespuestaLote>();

  archivosSeleccionados: File[] = [];
  vistasPrevias: string[] = [];
  maxArchivos = 6;
  isDragging = false;
  cargando = false; // Nueva variable para indicar el estado de carga

  // Manejo de archivos desde input de tipo file
  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.procesarArchivos(Array.from(input.files));
      input.value = ''; // Limpiar el input para permitir seleccionar los mismos archivos nuevamente
    }
  }

  // Manejo de Drag & Drop
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    if (event.dataTransfer?.files) {
      this.procesarArchivos(Array.from(event.dataTransfer.files));
    }
  }

  // Validación de límite de 6 fotos
  private procesarArchivos(files: File[]): void {
    const imagenesValidas = files.filter(f => f.type.startsWith('image/'));
    const disponibles = this.maxArchivos - this.archivosSeleccionados.length;
    const aAgregar = imagenesValidas.slice(0, disponibles);

    aAgregar.forEach(file => {
      this.archivosSeleccionados.push(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        this.vistasPrevias.push(e.target?.result as string);
        this.cdr.detectChanges(); // Forzar la detección de cambios para actualizar la vista previa
      };
      reader.readAsDataURL(file);
    });
  }

  eliminarImagen(index: number): void {
    this.archivosSeleccionados.splice(index, 1);
    this.vistasPrevias.splice(index, 1);
    this.cdr.detectChanges(); // Forzar la detección de cambios para actualizar la vista previa
  }

  procesarLote(): void {
    if (this.archivosSeleccionados.length === 0 || this.cargando) return;

    this.cargando = true;
    this.cdr.detectChanges(); // Asegurar que el loader se muestre de inmediato en pantalla

    this.horometrosService.procesarLote(this.archivosSeleccionados).subscribe({
      next: (respuesta: RespuestaLote) => {
        this.cargando = false;

        // Validar si la respuesta viene vacía o sin reportes procesados
        if (!respuesta.reportesOrdenados || respuesta.reportesOrdenados.length === 0) {
          alert('⚠️ No se pudo extraer información de ninguna imagen del lote. Por favor verifica las imágenes o reintenta en un momento.');
          this.cdr.detectChanges();
          return;
        }

        // Emitimos la respuesta para cambiar a la fase de RevisionLotes
        this.loteProcesado.emit(respuesta);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.cargando = false;
        const mensajeError = err.error?.error || 'Ocurrió un error al conectar con el servidor.';
        alert(`⚠️ ${mensajeError}`);
        this.cdr.detectChanges(); // Forzar ocultar el spinner de carga
      }
    });
  }
}