import { test, expect } from '@playwright/test';
import { loginComo, crearEscenarioDeTrabajador, crearCatalogoMinimo } from './helpers';

/*
Resumen de horas antes de cerrar jornada (pedido del usuario, 2026-10-23): al tocar "Marcar salida" en el
Panel de Actividades, el trabajador ya no cierra directo - primero ve el total de horas YA CERRADAS de hoy en
un H1 grande y elige entre proceder o volver a editar su jornada. Se prueba con el Camino A (código) porque no
depende de escanear un QR con cámara - un Mecánico cuya hacienda tiene Token vigente.
*/
test.describe('Panel de Actividades: resumen de horas antes de cerrar jornada', () => {
  test('muestra el total de horas trabajadas y permite volver a editar antes de cerrar la jornada', async ({ page, request }) => {
    const sufijo = `${Date.now()}`;
    const { tokenHacienda, operadorUsuario, operadorClave } = await crearEscenarioDeTrabajador(request, sufijo);
    const { equipoNombre, actividadDescripcion } = await crearCatalogoMinimo(request, sufijo);

    await loginComo(page, operadorUsuario, operadorClave);
    await expect(page).toHaveURL(/\/mi-jornada/);

    // Cuenta recién creada - ve el gate bloqueante de Términos antes que cualquier otra cosa (ver login.spec.ts).
    await page.check('input[name="aceptoTerminos"]');
    await page.click('button:has-text("Aceptar y continuar")');
    await expect(page.locator('button:has-text("Aceptar y continuar")')).toHaveCount(0);

    // Entrada por código (Camino A) - hacienda recién creada, con Token vigente generado arriba.
    await page.fill('input[name="codigo"]', tokenHacienda);
    await page.click('button:has-text("Confirmar")');

    // Panel de Actividades: registra UNA labor con hora de inicio/fin fijas (07:00 -> 08:00 = exactamente 1h),
    // para poder afirmar un texto exacto en el resumen sin depender de la hora real del reloj.
    await expect(page.locator('.card-title', { hasText: 'Panel de Actividades' })).toBeVisible();

    await page.fill('input[name="equipo_busqueda"]', equipoNombre);
    await page.click('.autocomplete-opcion', { hasText: equipoNombre });
    await page.fill('input[name="actividad_busqueda"]', actividadDescripcion);
    await page.click('.autocomplete-opcion', { hasText: actividadDescripcion });
    await page.fill('input[name="hora_inicio_hh"]', '7');
    await page.fill('input[name="hora_inicio_mm"]', '0');
    await page.click('button:has-text("➕ Iniciar labor")');

    const filaLabor = page.locator('tr', { has: page.locator('td', { hasText: equipoNombre }) });
    await expect(filaLabor).toBeVisible();

    await filaLabor.locator('button:has-text("Finalizar")').click();
    const inputsHoraFin = filaLabor.locator('input[type="number"]');
    await inputsHoraFin.nth(0).fill('8');
    await inputsHoraFin.nth(1).fill('0');
    await filaLabor.locator('button:has-text("✔️")').click();
    await expect(filaLabor.locator('.time-badge')).toHaveCount(2); // Inicio + Fin ya ambos presentes.

    // "Marcar salida" ya NO cierra directo - primero el resumen con el total (H1, bien legible).
    await page.click('button:has-text("🔚 Marcar salida")');
    await expect(page.locator('.modal-title', { hasText: 'Resumen de tu jornada' })).toBeVisible();
    await expect(page.locator('h1.resumen-horas-trabajadas')).toHaveText('1h');

    // "Editar mi jornada": cierra el resumen y regresa al Panel tal cual estaba, sin cerrar la jornada.
    await page.click('button:has-text("✏️ Editar mi jornada")');
    await expect(page.locator('.modal-backdrop')).toHaveCount(0);
    await expect(page.locator('.card-title', { hasText: 'Panel de Actividades' })).toBeVisible();
    await expect(filaLabor).toBeVisible(); // la labor sigue ahí, nada se perdió.

    // Reintentar "Marcar salida": el mismo resumen vuelve a aparecer con el mismo total.
    await page.click('button:has-text("🔚 Marcar salida")');
    await expect(page.locator('h1.resumen-horas-trabajadas')).toHaveText('1h');

    // Esta vez sí procede - cierra la jornada de verdad (Camino A reenvía el mismo Token, sin pedirlo de nuevo).
    await page.click('button:has-text("✅ Está de acuerdo, proceder a cerrar la jornada")');
    await expect(page.locator('.jornada-title')).toContainText('✅');
    await expect(page.locator('button:has-text("Cerrar sesión")')).toBeVisible();
  });
});
