import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Asistencia } from '../../../../core/models/asistencia.model';
import { VisorFoto } from '../visor-foto/visor-foto';
import { formatearHorasTrabajadas } from '../../../../core/utils/horas-trabajadas.util';

/*
Fila del Historial de Asistencia, compartida por la tabla general (asistencia-panel.html) y el modal
"Historial de Asistencia: {{nombre}}" por trabajador (pedido del usuario, 2026-10-28): antes cada
pantalla tenía su propia copia pegada a mano de esta fila, y al arreglar una se nos olvidó la otra
(ver PR #63, que solo tocó supervisor-panel.html) - esto pasó porque la regla de negocio de "qué se
puede ver/imprimir" vivía duplicada en 2 lugares del mismo archivo. Selector de atributo (`tr[...]`,
mismo truco que ya usa `app-visor-foto` dentro de una celda) para que siga rindiendo como una fila
<tr> real dentro del <table> existente de cada pantalla.
*/
@Component({
  standalone: true,
  selector: 'tr[app-fila-historial-asistencia]',
  imports: [CommonModule, VisorFoto],
  templateUrl: './fila-historial-asistencia.html',
})
export class FilaHistorialAsistencia {
  @Input({ required: true }) reg!: Asistencia;
  // La tabla general del Historial (varios operadores mezclados) necesita la columna de nombre; el
  // modal por trabajador no, porque el nombre ya está en el título del modal.
  @Input() mostrarOperador = false;
  @Input() cargandoReporteImpresion = false;
  @Output() ver = new EventEmitter<Asistencia>();
  @Output() imprimir = new EventEmitter<Asistencia>();

  formatearHorasTrabajadas = formatearHorasTrabajadas;
}
