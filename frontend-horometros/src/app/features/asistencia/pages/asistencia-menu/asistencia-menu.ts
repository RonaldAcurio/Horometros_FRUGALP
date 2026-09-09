import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  imports: [ RouterLink],
  selector: 'app-asistencia-menu',
  styleUrl: './asistencia-menu.css',
  templateUrl: './asistencia-menu.html',
})
export class AsistenciaMenu {}
