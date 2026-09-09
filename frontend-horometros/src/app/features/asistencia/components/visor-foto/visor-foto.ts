import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-visor-foto',
  styleUrl: './visor-foto.css',
  templateUrl: './visor-foto.html',
})
export class VisorFoto {
  @Input() fotoUrl: string | null | undefined = null;

  mostrarModal: boolean = false;

  abrir(): void {
    if(this.fotoUrl){
      this.mostrarModal = true;
    }
  }

  cerrar():void{
    this.mostrarModal = false;
  }
}
