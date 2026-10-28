import { test, expect } from '@playwright/test';
import { loginComo, crearEscenarioDeTrabajador, crearCatalogoMinimo } from './helpers';

const ADMIN = { usuario: 'e2e_admin', clave: 'E2ePrueba123' };

/*
Panel de Asistente: Historial de Asistencia (pedido del usuario, 2026-10-28). El PR #63 ya arregló que
el "+"/Ver/Imprimir no se oculte para un trabajador marcado X (OBSERVANDO) en el Panel de Supervisor,
pero `asistencia-panel.html` (Panel de Asistente) tenía su propia copia duplicada del mismo chequeo
viejo, en 2 lugares (la tabla general del Historial y el modal "Historial de Asistencia: {{nombre}}"
por trabajador) - seguía mostrando "No aplica" aunque el día tuviera actividades reales. Se extrajo
`FilaHistorialAsistencia`, un componente compartido por ambas tablas, para que esto no vuelva a pasar.
*/
test.describe('Panel de Asistente: Historial de Asistencia con un trabajador marcado X', () => {
  test('la tabla general Y el modal "Historial de Asistencia" por trabajador muestran Ver/Imprimir (sin "No aplica") para un día OBSERVANDO', async ({ page, request }) => {
    const sufijo = `${Date.now()}`;
    const esc = await crearEscenarioDeTrabajador(request, sufijo);
    const catalogo = await crearCatalogoMinimo(request, sufijo);

    // Arma el escenario por API (entrada + una labor + marcar X) - lo que este spec prueba de verdad es
    // el Historial de Asistente, no cómo se llega a tener un día OBSERVANDO con actividades (eso ya lo
    // prueba o-x-contador.spec.ts por UI real).
    const loginOperador = await (await request.post('http://localhost:3000/api/auth/login', {
      data: { usuario: esc.operadorUsuario, clave: esc.operadorClave },
    })).json();
    const entrada = await (await request.post('http://localhost:3000/api/asistencia/marcar-mi-codigo', {
      headers: { Authorization: `Bearer ${loginOperador.token}` },
      data: { token_hacienda: esc.tokenHacienda },
    })).json();
    const asistenciaId = entrada.asistencia.id;

    await request.post('http://localhost:3000/api/registro-actividades', {
      headers: { Authorization: `Bearer ${loginOperador.token}` },
      data: { asistencia_id: asistenciaId, equipo_id: catalogo.equipoId, actividad_id: catalogo.actividadId, hora_inicio: new Date().toISOString() },
    });

    const loginAdmin = await (await request.post('http://localhost:3000/api/auth/login', { data: ADMIN })).json();
    const headersAdmin = { Authorization: `Bearer ${loginAdmin.token}` };
    await request.put(`http://localhost:3000/api/asistencia/${asistenciaId}/confirmar`, {
      headers: headersAdmin, data: { presente: false },
    });

    await loginComo(page, ADMIN.usuario, ADMIN.clave);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/asistencia/asistente');

    // 1) Tabla general del Historial.
    await page.click('button.tab-btn:has-text("Historial de Asistencia")');
    const hoyISO = new Date().toLocaleDateString('en-CA');
    const inputsFecha = page.locator('input[type="date"]');
    await inputsFecha.nth(0).fill(hoyISO);
    await inputsFecha.nth(1).fill(hoyISO);
    await page.click('button:has-text("🔍 Buscar")');

    const filaGeneral = page.locator('tbody tr', { hasText: 'E2E Trabajador' });
    await expect(filaGeneral).toBeVisible();
    await expect(filaGeneral).toContainText('❌ No presente');
    await expect(filaGeneral).not.toContainText('No aplica');
    await expect(filaGeneral.locator('button:has-text("👁️ Ver")')).toBeVisible();
    await expect(filaGeneral.locator('button:has-text("🖨️ Imprimir")')).toBeVisible();

    await filaGeneral.locator('button:has-text("👁️ Ver")').click();
    const hojaModal = page.locator('.hoja-actividades-card');
    await expect(hojaModal).toBeVisible();
    await expect(hojaModal).toContainText(catalogo.equipoNombre);
    await page.click('.hoja-actividades-card button:has-text("✕")');
    await expect(hojaModal).not.toBeVisible();

    // 2) Modal "Historial de Asistencia: {{nombre}}" por trabajador (Directorio -> Ficha).
    await page.click('button.tab-btn:has-text("Directorio de Operadores")');
    await page.fill('input[placeholder*="Buscar"]', `OP${sufijo}`.slice(0, 20));
    await page.locator('tbody tr', { hasText: 'E2E Trabajador' }).click();
    await expect(page.locator('.card-title', { hasText: 'Ficha:' })).toBeVisible();
    await page.click('button:has-text("📅 Ver Historial de Asistencia")');

    const modalOperador = page.locator('.historial-operador-card');
    await expect(modalOperador).toBeVisible();
    const filaModal = modalOperador.locator('tbody tr', { hasText: hoyISO });
    await expect(filaModal).toBeVisible();
    await expect(filaModal).toContainText('❌ No presente');
    await expect(filaModal).not.toContainText('No aplica');
    await expect(filaModal.locator('button:has-text("👁️ Ver")')).toBeVisible();

    await filaModal.locator('button:has-text("👁️ Ver")').click();
    await expect(hojaModal).toBeVisible();
    await expect(hojaModal).toContainText(catalogo.equipoNombre);
  });
});
