import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  imports: [RouterLink],
  selector: 'app-dashboard',
  styleUrl: './dashboard.component.css',
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {}
