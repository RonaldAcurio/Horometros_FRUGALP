import { test, expect, Page } from '@playwright/test';
import { loginComo, crearEscenarioDeTrabajador, crearCatalogoMinimo } from './helpers';

const ADMIN = { usuario: 'e2e_admin', clave: 'E2ePrueba123' };
const API = 'http://localhost:3000/api';

// Toda cuenta nueva (como el operador sembrado por crearEscenarioDeTrabajador) ve el gate bloqueante de
// Terminos en su PRIMER login (ver login.spec.ts) - hay que pasarlo antes de poder clickear nada mas.
const aceptarTerminosSiAparece = async (page: Page): Promise<void> => {
  const botonAceptar = page.locator('button:has-text("Aceptar y continuar")');
  const apareceModal = await botonAceptar.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
  if (apareceModal) {
    await page.check('input[name="aceptoTerminos"]');
    await botonAceptar.click();
    await expect(botonAceptar).toHaveCount(0);
  }
};

/*
"Mi Perfil" del trabajador (pedido del usuario, 2026-10-28, rediseñado 2026-10-29 como tarjeta mobile-first):
QR del carnet, teléfono/dirección editables (cédula de solo lectura), usuario editable, clave propia
editable (autoservicio, sin pedir la actual), e historial propio dentro de un modal ("Ver historial"). La
jornada de AYER (no de hoy) se cierra por API antes del login: una jornada cerrada de HOY bloquearia el
login mismo (ver ESTADOS_JORNADA_CERRADA en auth.controller.ts) - de esta forma se prueba el historial con
datos reales sin interferir con el login del dia de la prueba.
*/
test.describe('Mi Perfil del trabajador', () => {
  test('QR, datos, historial en modal, cambio de usuario y de clave', async ({ page, request }) => {
    const sufijo = `${Date.now()}`;
    const esc = await crearEscenarioDeTrabajador(request, sufijo);
    const catalogo = await crearCatalogoMinimo(request, sufijo);

    const loginAdmin = await (await request.post(`${API}/auth/login`, { data: ADMIN })).json();
    const headersAdmin = { Authorization: `Bearer ${loginAdmin.token}` };

    // Cédula sembrada de entrada (vía ADMIN, antes del login real del operador) - así se puede confirmar
    // que editar teléfono/dirección en Mi Perfil NUNCA la toca (regresión del bug real encontrado al
    // construir esto - ver actualizarOperador en el backend).
    const loginOperadorInicial = await (await request.post(`${API}/auth/login`, {
      data: { usuario: esc.operadorUsuario, clave: esc.operadorClave },
    })).json();
    const operadorId = loginOperadorInicial.perfil.id;
    await request.put(`${API}/asistencia/operadores/${operadorId}`, {
      headers: headersAdmin, data: { cedula: '1790000000' },
    });

    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString('en-CA');
    const asistenciaAyer = await (await request.post(`${API}/asistencia/agregar-manual`, {
      headers: headersAdmin,
      data: { operador_id: operadorId, fecha: ayer, hora_ingreso: `${ayer}T08:00:00.000Z` },
    })).json();
    const asistenciaId = asistenciaAyer.asistencia.id;

    const headersOperador = { Authorization: `Bearer ${loginOperadorInicial.token}` };
    const registro = await (await request.post(`${API}/registro-actividades`, {
      headers: headersOperador,
      data: {
        asistencia_id: asistenciaId, equipo_id: catalogo.equipoId, actividad_id: catalogo.actividadId,
        hora_inicio: `${ayer}T08:30:00.000Z`,
      },
    })).json();
    await request.put(`${API}/registro-actividades/${registro.id}/finalizar`, {
      headers: headersOperador, data: { hora_fin: `${ayer}T10:30:00.000Z` },
    });

    await request.put(`${API}/asistencia/${asistenciaId}/confirmar`, { headers: headersAdmin, data: { presente: true } });
    await request.post(`${API}/asistencia/finalizar-dia`, {
      headers: headersAdmin, data: { fecha: ayer, supervisor_id: esc.supervisorId },
    });

    // --- UI real: login de HOY (el dia de ayer ya cerrado no bloquea esto) ---
    await loginComo(page, esc.operadorUsuario, esc.operadorClave);
    await aceptarTerminosSiAparece(page);
    await expect(page.locator('.jornada-barra-nombre')).toContainText(`E2E Trabajador ${sufijo}`);

    await page.click('text=👤 Mi Perfil');
    await expect(page).toHaveURL(/\/mi-perfil/);

    // QR del carnet visible (100% cliente, ver mi-perfil.ts).
    await expect(page.locator('.mi-perfil-qr')).toBeVisible();

    // Datos: cédula de solo lectura, teléfono/dirección vacíos al inicio.
    await expect(page.locator('.mi-perfil-dato-valor', { hasText: '1790000000' })).toBeVisible();

    // Editar teléfono/dirección y confirmar que persiste (sin recargar, vía actualizarPerfilLocal).
    await page.click('button:has-text("✏️ Editar datos")');
    await page.fill('.mi-perfil-seccion input[type="text"] >> nth=0', '0987654321');
    await page.fill('.mi-perfil-seccion input[type="text"] >> nth=1', 'Av. Siempre Viva 742');
    await page.click('button:has-text("💾 Guardar")');
    await expect(page.locator('.mi-perfil-dato-valor', { hasText: '0987654321' })).toBeVisible();
    await expect(page.locator('.mi-perfil-dato-valor', { hasText: 'Av. Siempre Viva 742' })).toBeVisible();
    // Cédula sigue intacta después de guardar teléfono/dirección.
    await expect(page.locator('.mi-perfil-dato-valor', { hasText: '1790000000' })).toBeVisible();

    // Historial: oculto por defecto, "Ver historial" lo abre en un modal con la jornada de AYER.
    await expect(page.locator('.mi-perfil-historial-card')).not.toBeVisible();
    await page.click('button:has-text("👁️ Ver historial")');
    const modalHistorial = page.locator('.mi-perfil-historial-card');
    await expect(modalHistorial).toBeVisible();

    const filaAyer = modalHistorial.locator('tbody tr', { hasText: ayer });
    await expect(filaAyer).toBeVisible();
    await expect(filaAyer.locator('button:has-text("👁️ Ver")')).toBeVisible();

    await filaAyer.locator('button:has-text("👁️ Ver")').click();
    const hojaModal = page.locator('.hoja-actividades-card');
    await expect(hojaModal).toBeVisible();
    await expect(hojaModal).toContainText(catalogo.equipoNombre);
    await page.click('.hoja-actividades-card button:has-text("✕")');
    await expect(hojaModal).not.toBeVisible();

    await page.click('.mi-perfil-historial-cerrar');
    await expect(modalHistorial).not.toBeVisible();

    // Cambiar usuario: confirma, guarda, cierra sesión sola.
    const usuarioNuevo = `e2e_op_nuevo_${sufijo}`;
    await page.click('button:has-text("✏️ Cambiar usuario")');
    await page.fill('input[placeholder="usuario"]', usuarioNuevo);
    await page.click('button:has-text("💾 Guardar")');
    await page.click('button:has-text("Aceptar")'); // ConfirmacionService

    await expect(page).toHaveURL(/\/login/);

    // Vuelve a entrar con el usuario nuevo para cambiar la clave (autoservicio, pedido del usuario, 2026-10-29).
    await loginComo(page, usuarioNuevo, esc.operadorClave);
    await aceptarTerminosSiAparece(page); // ya se habían aceptado - no debería volver a aparecer.
    await page.click('text=👤 Mi Perfil');
    await expect(page).toHaveURL(/\/mi-perfil/);

    const claveNueva = 'ClaveNuevaE2E123';
    await page.click('button:has-text("🔑 Restablecer contraseña")');
    await page.fill('input[type="password"] >> nth=0', claveNueva);
    await page.fill('input[type="password"] >> nth=1', claveNueva);
    await page.click('button:has-text("💾 Guardar clave")');
    await page.click('button:has-text("Aceptar")'); // ConfirmacionService

    await expect(page).toHaveURL(/\/login/);

    // La clave nueva funciona, la vieja ya no.
    await loginComo(page, usuarioNuevo, claveNueva);
    await aceptarTerminosSiAparece(page);
    await expect(page.locator('.jornada-barra-nombre')).toContainText(`E2E Trabajador ${sufijo}`);

    const loginConClaveVieja = await request.post(`${API}/auth/login`, {
      data: { usuario: usuarioNuevo, clave: esc.operadorClave },
    });
    expect(loginConClaveVieja.status()).toBe(401);
  });
});
