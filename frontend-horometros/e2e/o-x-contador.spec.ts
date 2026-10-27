import { test, expect } from '@playwright/test';
import { loginComo, crearEscenarioDeTrabajador, crearCatalogoMinimo } from './helpers';

/*
O/X como contador puro (pedido del usuario, 2026-10-27): marcar X ya no debe ocultar el "➕"/Ver/Imprimir
(O/X pasa a ser solo lo que ya exige finalizarDia para cerrar el día), y presionar "O" después de una X debe
desatascar el estado OBSERVANDO en vez de quedar trabado para siempre - confirmado con capturas reales en
producción donde "O" se veía marcado pero la fila seguía mostrando "No aplica" y sin el "+".
*/
test.describe('Panel de Supervisor: O/X como contador puro', () => {
  test('marcar X no oculta "+"/Ver/Imprimir, y "O" desatasca el OBSERVANDO', async ({ page, request }) => {
    const sufijo = `${Date.now()}`;
    const esc = await crearEscenarioDeTrabajador(request, sufijo);
    const catalogo = await crearCatalogoMinimo(request, sufijo);

    // Entrada real via API (Camino A, código) - fila normal EN_JORNADA en la tabla, sin que el spec tenga
    // que resolver la UI del kiosco de marcación (eso ya lo prueba mi-jornada-resumen-salida.spec.ts).
    const loginOperador = await (await request.post('http://localhost:3000/api/auth/login', {
      data: { usuario: esc.operadorUsuario, clave: esc.operadorClave },
    })).json();
    await request.post('http://localhost:3000/api/asistencia/marcar-mi-codigo', {
      headers: { Authorization: `Bearer ${loginOperador.token}` },
      data: { token_hacienda: esc.tokenHacienda },
    });

    await loginComo(page, `e2e_sup_${sufijo}`, 'ClaveSup123');
    await expect(page).toHaveURL(/\/dashboard/);
    await page.check('input[name="aceptoTerminos"]');
    await page.click('button:has-text("Aceptar y continuar")');
    await expect(page.locator('button:has-text("Aceptar y continuar")')).toHaveCount(0);

    await page.goto('/asistencia/supervisor');

    const fila = page.locator('tbody tr', { hasText: 'E2E Trabajador' });
    await expect(fila).toBeVisible();
    await expect(fila.locator('button[title="Ver/agregar labores de este trabajador"]')).toBeVisible();
    await expect(fila.locator('button:has-text("👁️ Ver")')).toBeVisible();
    await expect(fila).not.toContainText('No aplica');

    // Marcar X (por title, no por texto - "X" como substring matchearía con "Cerrado"/otros textos de la fila).
    await fila.locator('button[title="Marcar que NO vino"]').click();
    await page.click('button:has-text("Aceptar")');
    await expect(fila.locator('.status-revision')).toHaveText('OBSERVANDO');

    // El "+"/Ver/Imprimir SIGUEN visibles con X (ya no hay "No aplica").
    await expect(fila.locator('button[title="Ver/agregar labores de este trabajador"]')).toBeVisible();
    await expect(fila.locator('button:has-text("👁️ Ver")')).toBeVisible();
    await expect(fila.locator('button:has-text("🖨️ Imprimir")')).toBeVisible();
    await expect(fila).not.toContainText('No aplica');

    // Se le puede agregar una actividad aunque esté OBSERVANDO (el backend ya no lo bloquea).
    await fila.locator('button[title="Ver/agregar labores de este trabajador"]').click();
    const panelLabores = page.locator('.panel-labores-card');
    await expect(panelLabores).toBeVisible();
    await page.fill('input[name="equipo_busqueda"]', catalogo.equipoNombre.slice(0, 6));
    await page.locator('.autocomplete-opcion', { hasText: catalogo.equipoNombre }).click();
    await page.fill('input[name="actividad_busqueda"]', catalogo.actividadDescripcion.slice(0, 6));
    await page.locator('.autocomplete-opcion', { hasText: catalogo.actividadDescripcion }).click();
    await page.fill('input[name="hora_inicio_hh"]', '7');
    await page.fill('input[name="hora_inicio_mm"]', '30');
    await page.click('button:has-text("➕ Agregar labor")');
    await expect(panelLabores.locator('tbody tr', { hasText: catalogo.equipoNombre })).toBeVisible();
    await page.click('.panel-labores-cerrar');
    await expect(panelLabores).not.toBeVisible();

    // "O" desatasca el OBSERVANDO - sin hora_salida, vuelve a EN_JORNADA.
    await fila.locator('button[title="Confirmar que sí vino"]').click();
    await expect(fila.locator('.status-jornada')).toHaveText('EN_JORNADA');
    await expect(fila).not.toContainText('No aplica');
  });
});
