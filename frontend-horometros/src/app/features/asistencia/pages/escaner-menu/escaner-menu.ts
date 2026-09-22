import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/*
Landing dedicado del rol ESCANER: una sola opcion, a proposito (ver CLAUDE.md). La camara solo se activa cuando
el usuario entra a /asistencia/escanear; volver aca (boton "Menú" del header, o el de abajo) desmonta ese
componente y su ngOnDestroy apaga la camara sola - asi el dispositivo puede "descansarla" sin cerrar sesion.
*/
@Component({
  standalone: true,
  imports: [RouterLink],
  selector: 'app-escaner-menu',
  styleUrl: './escaner-menu.css',
  templateUrl: './escaner-menu.html',
})
export class EscanerMenu {}
