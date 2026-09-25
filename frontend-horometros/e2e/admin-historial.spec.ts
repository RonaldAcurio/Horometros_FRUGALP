import { test, expect } from '@playwright/test';
import { loginComo, crearUsuarioOficina } from './helpers';

const ADMIN = { usuario: 'e2e_admin', clave: 'E2ePrueba123' };

test.describe('Menu Admin: resetear clave y ver el Historial de auditoría', () => {
  test('resetear la clave de un usuario queda registrado y visible en el Historial', async ({ page }) => {
    await loginComo(page, ADMIN.usuario, ADMIN.clave);
    await expect(page).toHaveURL(/\/dashboard/);

    const usuarioVictima = `e2e_victima_${Date.now()}`;
    await crearUsuarioOficina(page, {
      nombre_completo: 'E2E Victima Reseteo',
      usuario: usuarioVictima,
      clave: 'ClaveVieja123',
      cargo: 'ASISTENTE',
    });

    // Resetear la clave desde la fila del usuario recien creado (.code-badge = la celda "Usuario" de la
    // tabla, no un texto suelto: el toast de exito de crearUsuarioOficina tambien contiene el mismo texto).
    const fila = page.locator('tr', { has: page.locator('.code-badge', { hasText: usuarioVictima }) });
    await fila.locator('button:has-text("Resetear clave")').click();
    await expect(page.locator('.modal-title')).toContainText('E2E Victima Reseteo');
    await page.fill('input[name="claveNueva"]', 'ClaveNuevaReset123');
    await page.click('button:has-text("Actualizar clave")');
    await expect(page.locator('.modal-backdrop')).toHaveCount(0);

    // Pestaña Historial: debe mostrar el reseteo que se acaba de hacer, arriba de todo (mas reciente primero).
    await page.click('button:has-text("Historial")');
    const primeraFila = page.locator('table.data-table tbody tr').first();
    await expect(primeraFila).toContainText('Reseteó la clave de');
    await expect(primeraFila).toContainText('E2E Victima Reseteo');
    await expect(primeraFila).toContainText('E2E Admin');
  });
});
