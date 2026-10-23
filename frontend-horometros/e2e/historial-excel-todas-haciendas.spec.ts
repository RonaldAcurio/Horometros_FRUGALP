import { test, expect } from '@playwright/test';
import { Workbook } from 'exceljs';
import { loginComo, crearEscenarioDeTrabajador, crearCatalogoMinimo, completarJornadaDeHoyViaApi } from './helpers';

const ADMIN = { usuario: 'e2e_admin', clave: 'E2ePrueba123' };

const horaDeHoy = (hh: number, mm: number): string => {
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
};

/*
Exportar Excel de todas las haciendas sin elegir Hacienda/Supervisor (pedido del usuario, 2026-10-23): deja
"Todas"/"Todos" en los selectores y descarga UN solo archivo con una hoja por hacienda, en orden alfabético.
Las jornadas en sí (entrada/labor/salida/confirmación/cierre) se arman por API - lo que este spec prueba de
verdad es el botón "Exportar a Excel" y el archivo que produce, no cómo se llega a tener datos en el Historial
(eso ya lo prueba mi-jornada-resumen-salida.spec.ts por UI real).
*/
test.describe('Panel de Asistente: exportar Excel de todas las haciendas', () => {
  test('con Hacienda y Supervisor en "Todas"/"Todos" descarga un solo .xlsx con una hoja por hacienda, en orden alfabético', async ({ page, request }) => {
    const sufijo = Date.now();
    const { equipoId, actividadId } = await crearCatalogoMinimo(request, `${sufijo}`);

    // "Zeta" se crea PRIMERO a propósito - si el archivo solo calcara el orden de creación, la hoja de Zeta
    // saldría primero. El pedido del usuario es que salga alfabético (Alfa antes que Zeta) sin importar esto.
    const zeta = await crearEscenarioDeTrabajador(request, `Zeta${sufijo}`);
    const alfa = await crearEscenarioDeTrabajador(request, `Alfa${sufijo}`);

    await completarJornadaDeHoyViaApi(request, {
      tokenHacienda: zeta.tokenHacienda, supervisorId: zeta.supervisorId,
      operadorUsuario: zeta.operadorUsuario, operadorClave: zeta.operadorClave,
      equipoId, actividadId, horaInicio: horaDeHoy(7, 0), horaFin: horaDeHoy(9, 0), // 2h
    });
    await completarJornadaDeHoyViaApi(request, {
      tokenHacienda: alfa.tokenHacienda, supervisorId: alfa.supervisorId,
      operadorUsuario: alfa.operadorUsuario, operadorClave: alfa.operadorClave,
      equipoId, actividadId, horaInicio: horaDeHoy(7, 0), horaFin: horaDeHoy(7, 30), // 30min
    });

    await loginComo(page, ADMIN.usuario, ADMIN.clave);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/asistencia/asistente');
    await page.click('button.tab-btn:has-text("Historial de Asistencia")');

    const hoyISO = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD en hora local, igual que fechaInicioFiltro.
    const inputsFecha = page.locator('input[type="date"]');
    await inputsFecha.nth(0).fill(hoyISO);
    await inputsFecha.nth(1).fill(hoyISO);
    // Hacienda y Supervisor se dejan en "Todas"/"Todos" (valor por defecto, null) - justo el caso nuevo.
    await page.click('button:has-text("🔍 Buscar")');

    const botonExportar = page.locator('button:has-text("📊 Exportar a Excel")');
    await expect(botonExportar).toBeEnabled();

    const [descarga] = await Promise.all([
      page.waitForEvent('download'),
      botonExportar.click(),
    ]);

    expect(descarga.suggestedFilename()).toMatch(/^TALLER TODOS \d{8}\.xlsx$/);

    const wb = new Workbook();
    const ruta = await descarga.path();
    if (!ruta) throw new Error('La descarga no generó un archivo en disco.');
    await wb.xlsx.readFile(ruta);

    const nombresDeHoja = wb.worksheets.map((ws) => ws.name);
    const indiceAlfa = nombresDeHoja.findIndex((n) => n.includes(`E2E Hacienda Alfa${sufijo}`));
    const indiceZeta = nombresDeHoja.findIndex((n) => n.includes(`E2E Hacienda Zeta${sufijo}`));
    expect(indiceAlfa).toBeGreaterThanOrEqual(0);
    expect(indiceZeta).toBeGreaterThanOrEqual(0);
    // Orden alfabético (pedido del usuario, 2026-10-23): Alfa antes que Zeta, aunque Zeta se creó primero.
    expect(indiceAlfa).toBeLessThan(indiceZeta);
  });
});
