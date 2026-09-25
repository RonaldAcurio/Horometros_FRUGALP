import { test, expect } from '@playwright/test';
import { loginComo, crearUsuarioOficina } from './helpers';

/*
Cuenta sembrada por sembrar-e2e.ts (backend) - ya tiene terminos_aceptados_en, por eso este spec la usa para
probar login normal y usa una cuenta NUEVA (creada aca mismo via la UI) para probar el gate de Terminos, que
necesita una cuenta que TODAVIA no acepto (terminos_aceptados_en null - asi nace cualquier cuenta nueva).
*/
const ADMIN = { usuario: 'e2e_admin', clave: 'E2ePrueba123' };

test.describe('Login', () => {
  test('rechaza clave incorrecta con un mensaje de error', async ({ page }) => {
    await loginComo(page, ADMIN.usuario, 'clave-incorrecta');
    await expect(page.locator('.alert-danger')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('login correcto de ADMIN va al Dashboard', async ({ page }) => {
    await loginComo(page, ADMIN.usuario, ADMIN.clave);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('.sesion-nombre')).toHaveText('E2E Admin');
  });

  test('una cuenta nueva ve el gate de Terminos bloqueante y no lo vuelve a ver despues de aceptar', async ({ page }) => {
    await loginComo(page, ADMIN.usuario, ADMIN.clave);
    await expect(page).toHaveURL(/\/dashboard/);

    const usuarioNuevo = `e2e_terminos_${Date.now()}`;
    await crearUsuarioOficina(page, {
      nombre_completo: 'E2E Nueva Cuenta',
      usuario: usuarioNuevo,
      clave: 'ClaveNueva123',
      cargo: 'ASISTENTE',
    });

    await page.click('button:has-text("Cerrar sesión")');
    await expect(page).toHaveURL(/\/login/);

    await loginComo(page, usuarioNuevo, 'ClaveNueva123');

    // Modal bloqueante: boton deshabilitado hasta marcar el checkbox, sin boton "Cerrar" alternativo.
    const botonAceptar = page.locator('button:has-text("Aceptar y continuar")');
    await expect(botonAceptar).toBeVisible();
    await expect(botonAceptar).toBeDisabled();

    await page.check('input[name="aceptoTerminos"]');
    await expect(botonAceptar).toBeEnabled();
    await botonAceptar.click();
    await expect(page.locator('button:has-text("Aceptar y continuar")')).toHaveCount(0);

    // No debe volver a aparecer despues de un refresh (queda guardado en la cuenta).
    await page.reload();
    await expect(page.locator('button:has-text("Aceptar y continuar")')).toHaveCount(0);
  });
});
