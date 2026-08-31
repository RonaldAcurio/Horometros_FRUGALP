import { Component } from '@angular/core';
import { CargaLoteComponent } from './components/carga-lote/carga-lote.component';

@Component({
  standalone:true,
  imports: [CargaLoteComponent],
  selector: 'app-horometros',
  styleUrl: './horometros.component.css',
  templateUrl: './horometros.component.html',
})
export class HorometrosComponent {}
