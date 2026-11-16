import { test, expect } from '@playwright/test';
import { loginComo, crearEscenarioDeTrabajador, crearCatalogoMinimo } from './helpers';

const API = 'http://localhost:3000/api';
const ADMIN_E2E = { usuario: 'e2e_admin', clave: 'E2ePrueba123' };

/*
Verificación en vivo del pedido del usuario, 2026-11-16 (plan en /root/.claude/plans/quiet-napping-spark.md):
"Cerrar Jornada" ya no se puede ejecutar (ni Supervisor ni ADMIN) mientras exista algún trabajador del roster
sin NINGUNA Asistencia ese día - la tabla fusionada muestra a TODOS desde el inicio, con "✗ Marcar ausente"
como única acción habilitada hasta que de verdad inicien sesión (ahí recién se habilitan O/X). También
confirma que "Cerrar Jornada" exige conexión (ya no se encola sin señal, a diferencia de otras acciones
offline-first de esta app).
*/
test.describe('Panel de Supervisor: "Cerrar Jornada" exige que todos queden resueltos', () => {
  test('bloquea el cierre mientras falten trabajadores, y lo habilita recién cuando todos están resueltos', async ({ page, request }) => {
    const sufijo = `${Date.now()}C`;
    const esc = await crearEscenarioDeTrabajador(request, sufijo, { rol: 'OPERADOR' });
    const catalogo = await crearCatalogoMinimo(request, sufijo);

    // Segundo trabajador de la MISMA hacienda, directo por API (no es el flujo bajo prueba) - para probar
    // "faltan 2" -> "falta 1" -> "ya puede cerrar", no solo el caso trivial de un único pendiente.
    const loginAdmin = await (await request.post(`${API}/auth/login`, { data: ADMIN_E2E })).json();
    const headersAdmin = { Authorization: `Bearer ${loginAdmin.token}` };
    const operadorB = await (await request.post(`${API}/asistencia/operadores`, {
      headers: headersAdmin,
      data: {
        nombre_completo: `E2E Trabajador B ${sufijo}`, codigo_megued: `OPB${sufijo}`.slice(0, 20),
        rol: 'OPERADOR', supervisor_id: esc.supervisorId,
      },
    })).json();

    await loginComo(page, `e2e_sup_${sufijo}`, 'ClaveSup123');
    await expect(page).toHaveURL(/\/dashboard/);
    await page.check('input[name="aceptoTerminos"]');
    await page.click('button:has-text("Aceptar y continuar")');
    await expect(page.locator('button:has-text("Aceptar y continuar")')).toHaveCount(0);

    await page.goto('/asistencia/supervisor');

    const botonCerrar = page.locator('button', { hasText: /Cerrar Jornada|por marcar|Sin conexión/ });
    await expect(botonCerrar).toContainText('Faltan 2 por marcar');
    await expect(botonCerrar).toBeDisabled();

    // Intentar igual vía API (por si alguien se salta el botón deshabilitado) - el backend bloquea nombrando
    // a los 2, sin excepción.
    const tokenSup = (await (await request.post(`${API}/auth/login`, { data: { usuario: `e2e_sup_${sufijo}`, clave: 'ClaveSup123' } })).json()).token;
    const intentoDirecto = await request.post(`${API}/asistencia/finalizar-dia`, { headers: { Authorization: `Bearer ${tokenSup}` }, data: {} });
    expect(intentoDirecto.status()).toBe(400);
    const cuerpoIntento = await intentoDirecto.json();
    expect(cuerpoIntento.faltan_por_marcar).toEqual(
      expect.arrayContaining([`E2E Trabajador ${sufijo}`, `E2E Trabajador B ${sufijo}`])
    );

    // Trabajador A: fila pendiente en la tabla única - O/X deshabilitados, solo "Marcar ausente" disponible.
    const filaA = page.locator('tbody tr.fila-pendiente', { hasText: `E2E Trabajador ${sufijo}` }).first();
    await expect(filaA).toBeVisible();
    await expect(filaA.locator('button:has-text("O")')).toBeDisabled();
    await expect(filaA.locator('button:has-text("X")')).toBeDisabled();

    await filaA.locator('button:has-text("✗ Marcar ausente")').click();
    await expect(page.locator('.agregar-usuario-card')).toBeVisible();
    await page.fill('input[name="hora_ingreso_hh"]', '7');
    await page.fill('input[name="hora_ingreso_mm"]', '0');
    await page.click('button:has-text("Agregar a la lista de hoy")');
    await expect(page.locator('.agregar-usuario-card')).not.toBeVisible();

    // Se abre el Panel de labores automático - le carga Equipo/Actividad real, como pide el flujo existente.
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

    // Ahora A es fila real - confirmar O (presente). Sigue faltando B -> "Falta 1 por marcar".
    const filaRealA = page.locator('tbody tr', { hasText: `E2E Trabajador ${sufijo}` }).first();
    await filaRealA.locator('button:has-text("O")').click();
    await expect(botonCerrar).toContainText('Faltan 1 por marcar');
    await expect(botonCerrar).toBeDisabled();

    // Trabajador B: mismo flujo (marcar ausente + actividad + confirmar).
    const filaB = page.locator('tbody tr.fila-pendiente', { hasText: operadorB.nombre_completo });
    await expect(filaB).toBeVisible();
    await filaB.locator('button:has-text("✗ Marcar ausente")').click();
    await expect(page.locator('.agregar-usuario-card')).toBeVisible();
    await page.fill('input[name="hora_ingreso_hh"]', '7');
    await page.fill('input[name="hora_ingreso_mm"]', '5');
    await page.click('button:has-text("Agregar a la lista de hoy")');
    await expect(page.locator('.agregar-usuario-card')).not.toBeVisible();

    const panelLaboresB = page.locator('.panel-labores-card');
    await expect(panelLaboresB).toBeVisible();
    await page.fill('input[name="equipo_busqueda"]', catalogo.equipoNombre.slice(0, 6));
    await page.locator('.autocomplete-opcion', { hasText: catalogo.equipoNombre }).click();
    await page.fill('input[name="actividad_busqueda"]', catalogo.actividadDescripcion.slice(0, 6));
    await page.locator('.autocomplete-opcion', { hasText: catalogo.actividadDescripcion }).click();
    await page.fill('input[name="hora_inicio_hh"]', '7');
    await page.fill('input[name="hora_inicio_mm"]', '35');
    await page.click('button:has-text("➕ Agregar labor")');
    await expect(panelLaboresB.locator('tbody tr', { hasText: catalogo.equipoNombre })).toBeVisible();
    await page.click('.panel-labores-cerrar');
    await expect(panelLaboresB).not.toBeVisible();

    const filaRealB = page.locator('tbody tr', { hasText: operadorB.nombre_completo });
    await filaRealB.locator('button:has-text("O")').click();

    // Ya no queda ninguna fila pendiente, y el botón vuelve a ser "Cerrar Jornada", habilitado.
    await expect(page.locator('tbody tr.fila-pendiente')).toHaveCount(0);
    await expect(botonCerrar).toHaveText('🔒 Cerrar Jornada');
    await expect(botonCerrar).toBeEnabled();

    await botonCerrar.click();
    await page.click('button:has-text("Aceptar")'); // confirmación del cuadro "¿Desea realizar el cierre diario...?".
    await expect(page.locator('button', { hasText: '🔒 Jornada Cerrada' })).toBeVisible();
  });

  test('"Cerrar Jornada" exige conexión - se deshabilita y avisa sin señal, sin encolar nada', async ({ page, request, context }) => {
    const sufijo = `${Date.now()}D`;
    const esc = await crearEscenarioDeTrabajador(request, sufijo, { rol: 'OPERADOR' });

    await loginComo(page, `e2e_sup_${sufijo}`, 'ClaveSup123');
    await page.check('input[name="aceptoTerminos"]');
    await page.click('button:has-text("Aceptar y continuar")');
    await expect(page.locator('button:has-text("Aceptar y continuar")')).toHaveCount(0);
    await page.goto('/asistencia/supervisor');

    // Marca presente al único trabajador para que lo único que falte sea la conexión, no el roster.
    const fila = page.locator('tbody tr.fila-pendiente', { hasText: `E2E Trabajador ${sufijo}` });
    await fila.locator('button:has-text("✗ Marcar ausente")').click();
    await page.fill('input[name="hora_ingreso_hh"]', '7');
    await page.fill('input[name="hora_ingreso_mm"]', '0');
    await page.click('button:has-text("Agregar a la lista de hoy")');
    await page.click('.panel-labores-cerrar');
    const filaReal = page.locator('tbody tr', { hasText: `E2E Trabajador ${sufijo}` });
    await filaReal.locator('button:has-text("O")').click();

    const botonCerrar = page.locator('button', { hasText: /Cerrar Jornada|Sin conexión/ });
    await expect(botonCerrar).toBeEnabled();

    await context.setOffline(true);
    await expect(botonCerrar).toHaveText('📡 Sin conexión');
    await expect(botonCerrar).toBeDisabled();

    await context.setOffline(false);
    await expect(botonCerrar).toHaveText('🔒 Cerrar Jornada');
    await expect(botonCerrar).toBeEnabled();
  });
});
