import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  standalone:true,
  imports: [CommonModule],
  selector: 'app-carga-lote',
  styleUrl: './carga-lote.component.css',
  templateUrl: './carga-lote.component.html',
})
export class CargaLoteComponent {
  archivosSeleccionados: File[] = [];
  vistasPrevias: string[] = [];
  maxArchivos = 6;
  isDragging = false;

  // Manejo de archivos desde input de tipo file
  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.procesarArchivos(Array.from(input.files));
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
      };
      reader.readAsDataURL(file);
    });
  }

  eliminarImagen(index: number): void {
    this.archivosSeleccionados.splice(index, 1);
    this.vistasPrevias.splice(index, 1);
  }

  procesarLote(): void {
    if (this.archivosSeleccionados.length === 0) return;
    console.log('Enviando batch al Backend:', this.archivosSeleccionados);
    // Aquí invocaremos el servicio del Backend en la siguiente iteración
  }
}
