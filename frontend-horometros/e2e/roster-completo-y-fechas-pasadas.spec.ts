import { test, expect } from '@playwright/test';
import { Workbook } from 'exceljs';
import { loginComo, crearEscenarioDeTrabajador, crearCatalogoMinimo } from './helpers';

/*
Verificación en vivo del pedido del usuario, 2026-10-27 (plan en /root/.claude/plans/quiet-napping-spark.md):
1) "+ Agregar Usuario" funciona también para un día anterior no cerrado, pidiendo la hora de ingreso a mano.
2) El roster completo del Panel de Supervisor muestra a quien todavía no tiene asistencia ese día, y marcarlo
   ausente (X) desde ahí crea la Asistencia con hora manual, abre el Panel de labores para agregarle
   Equipo/Actividad, y recién al final aplica la X real (OBSERVANDO) - que YA aparece en el Excel con sus
   actividades (ya no se excluye, reemplaza la decisión documentada del 2026-10-16).
*/
test.describe('Panel de Supervisor: fechas pasadas + roster completo + marcar ausente', () => {
  test('"+ Agregar Usuario" en un día anterior no cerrado pide hora manual y agrega al trabajador a ESE día', async ({ page, request }) => {
    const sufijo = `${Date.now()}A`;
    const esc = await crearEscenarioDeTrabajador(request, sufijo);

    // "Ayer" calculado en hora de Ecuador, igual que hoyEcuador() del modal (America/Guayaquil, UTC-5) - no en
    // la hora local de donde corre el test, para no caer en el límite de medianoche UTC (ahí "ayer" en UTC
    // puede coincidir con "hoy" en Ecuador, y viceversa).
    const hoyEcuadorStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
    const [anioHoy, mesHoy, diaHoy] = hoyEcuadorStr.split('-').map(Number);
    const ayerDate = new Date(Date.UTC(anioHoy, mesHoy - 1, diaHoy));
    ayerDate.setUTCDate(ayerDate.getUTCDate() - 1);
    const ayerISO = ayerDate.toISOString().slice(0, 10);
    const [anioA, mesA, diaA] = ayerISO.split('-');
    const ayerFormateado = `${diaA}/${mesA}/${anioA}`;

    await loginComo(page, `e2e_sup_${sufijo}`, 'ClaveSup123');
    await expect(page).toHaveURL(/\/dashboard/);

    // Cuenta recién creada - ve el gate bloqueante de Términos antes que cualquier otra cosa (ver login.spec.ts).
    await page.check('input[name="aceptoTerminos"]');
    await page.click('button:has-text("Aceptar y continuar")');
    await expect(page.locator('button:has-text("Aceptar y continuar")')).toHaveCount(0);

    await page.goto('/asistencia/supervisor');

    const inputFecha = page.locator('input[type="date"]');
    await inputFecha.fill(ayerISO);
    await inputFecha.press('Tab');
    await expect(page.locator('.card-title', { hasText: `Registro de Asistencia del ${ayerISO}` })).toBeVisible();

    await page.click('button:has-text("➕ Agregar Usuario")');
    await expect(page.locator('.agregar-usuario-card')).toBeVisible();

    // Fecha pasada (pedido del usuario, 2026-10-27): el botón confirma a qué día se agrega, y pide la hora
    // de ingreso a mano (nadie la disparó automático, nunca usó el Token/QR ese día).
    const botonConfirmar = page.locator('button', { hasText: `Agregar a la lista del ${ayerFormateado}` });
    await expect(botonConfirmar).toBeVisible();
    await expect(botonConfirmar).toBeDisabled(); // todavía no se elige a nadie ni se llena la hora.

    await page.locator('.autocomplete-opcion', { hasText: 'E2E Trabajador' }).first().click();
    await page.fill('input[name="hora_ingreso_hh"]', '7');
    await page.fill('input[name="hora_ingreso_mm"]', '15');
    await expect(botonConfirmar).toBeEnabled();
    await botonConfirmar.click();

    await expect(page.locator('.agregar-usuario-card')).not.toBeVisible();

    // Fila de la tabla de asistencias REALES (no la del roster, que puede tardar un instante más en
    // refrescarse) - el botón ➕ solo existe ahí (ver supervisor-panel.html).
    const fila = page.locator('tbody tr').filter({ has: page.locator('button', { hasText: '➕' }) });
    await expect(fila).toBeVisible();
    await expect(fila).toContainText('E2E Trabajador');
    await expect(fila.locator('td').nth(1)).toHaveText(ayerISO);
    await expect(fila.locator('.time-badge').first()).toBeVisible(); // Ingreso: ya no queda en "-".

    // Ya tiene Asistencia ese día -> sale de "Trabajadores que aún no marcan" (roster completo).
    await expect(page.locator('.card-title', { hasText: 'Trabajadores que aún no marcan' })).not.toBeVisible();
  });

  test('roster completo: marcar ausente agrega hora manual + actividades vía Panel de labores, y la X real aparece en el Excel', async ({ page, request }) => {
    const sufijo = `${Date.now()}B`;
    const esc = await crearEscenarioDeTrabajador(request, sufijo);
    const catalogo = await crearCatalogoMinimo(request, sufijo);

    await loginComo(page, `e2e_sup_${sufijo}`, 'ClaveSup123');
    await expect(page).toHaveURL(/\/dashboard/);

    // Cuenta recién creada - ve el gate bloqueante de Términos antes que cualquier otra cosa (ver login.spec.ts).
    await page.check('input[name="aceptoTerminos"]');
    await page.click('button:has-text("Aceptar y continuar")');
    await expect(page.locator('button:has-text("Aceptar y continuar")')).toHaveCount(0);

    await page.goto('/asistencia/supervisor');

    // El trabajador recién creado nunca marcó entrada hoy -> aparece en el roster completo, no en la tabla
    // paginada de arriba (pedido del usuario, 2026-10-27: el reporte no debe dejar a nadie afuera).
    const tarjetaRoster = page.locator('.card', { has: page.locator('.card-title', { hasText: 'Trabajadores que aún no marcan' }) });
    await expect(tarjetaRoster.locator('tr', { hasText: 'E2E Trabajador' })).toBeVisible();
    await expect(page.locator('tr', { hasText: 'E2E Trabajador' }).locator('.btn-warning')).toHaveCount(1); // solo la fila del roster, no la paginada.

    await tarjetaRoster.locator('button:has-text("✗ Marcar ausente")').click();

    // Se abre "Agregar Usuario" con el operador ya fijo (sin buscar nada) - siempre pide hora manual.
    await expect(page.locator('.agregar-usuario-card')).toBeVisible();
    await expect(page.locator('.agregar-usuario-card')).toContainText('Vas a marcar a');
    await expect(page.locator('.agregar-usuario-card')).toContainText('E2E Trabajador');
    await page.fill('input[name="hora_ingreso_hh"]', '7');
    await page.fill('input[name="hora_ingreso_mm"]', '0');
    await page.click('button:has-text("Agregar a la lista de hoy")');
    await expect(page.locator('.agregar-usuario-card')).not.toBeVisible();

    // Al terminar, se abre AUTOMÁTICAMENTE el Panel de labores sobre la Asistencia recién creada (todavía
    // EN_JORNADA, nunca OBSERVANDO primero - el backend ya no deja agregar labores a una Asistencia
    // OBSERVANDO, ver puedeForzarEnEstaAsistencia).
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

    // Ahora sí es una fila real en la tabla paginada, con sus actividades - toca la X real (confirmarPresencia
    // false -> OBSERVANDO). Ya no está en el roster (ya tiene Asistencia).
    await expect(page.locator('.card-title', { hasText: 'Trabajadores que aún no marcan' })).not.toBeVisible();
    const filaReal = page.locator('tbody tr', { hasText: 'E2E Trabajador' });
    await expect(filaReal).toBeVisible();
    await expect(filaReal).toContainText(catalogo.equipoNombre.split(' ').pop()!); // código del equipo en "Actividades".

    await filaReal.locator('button:has-text("X")').click();
    await page.click('button:has-text("Aceptar")'); // confirmación del cuadro "Marcar como NO presente".
    await expect(filaReal.locator('.status-revision')).toHaveText('OBSERVANDO');

    // El botón "+" desaparece una vez OBSERVANDO (ya no se pueden agregar más labores - puedeForzarEnEstaAsistencia
    // las excluye a propósito), pero YA NO se oculta "Ver/Imprimir" (eso seguía apagado para OBSERVANDO antes de
    // este pedido - sigue así, no es parte de lo pedido el 2026-10-27, solo el Excel/Imprimir General cambian).

    // Exportar a Excel (pedido del usuario, 2026-10-27: el marcado con X YA debe aparecer, con su equipo/actividad).
    const botonExportar = page.locator('button:has-text("📊 Exportar a Excel")');
    await expect(botonExportar).toBeEnabled();
    const [descarga] = await Promise.all([
      page.waitForEvent('download'),
      botonExportar.click(),
    ]);

    const wb = new Workbook();
    const ruta = await descarga.path();
    if (!ruta) throw new Error('La descarga no generó un archivo en disco.');
    await wb.xlsx.readFile(ruta);
    const ws = wb.worksheets[0];

    let filaConOperador: number | null = null;
    let filaConEquipo: number | null = null;
    ws.eachRow((row, numeroFila) => {
      row.eachCell((cell) => {
        const valor = String(cell.value ?? '');
        if (valor.includes('E2E Trabajador')) filaConOperador = numeroFila;
        if (valor.includes(catalogo.equipoNombre)) filaConEquipo = numeroFila;
      });
    });
    expect(filaConOperador).not.toBeNull();
    expect(filaConEquipo).not.toBeNull();
    expect(filaConEquipo).toBe(filaConOperador); // misma fila: el ausente sale con su equipo/actividad, no en blanco.
  });
});
