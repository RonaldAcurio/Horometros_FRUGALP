import { Page, expect } from '@playwright/test';

// Helpers compartidos por los specs de e2e/ (ver CLAUDE.md, "Pruebas end-to-end").

export const loginComo = async (page: Page, usuario: string, clave: string): Promise<void> => {
  await page.goto('/login');
  await page.fill('#usuario', usuario);
  await page.fill('#clave', clave);
  await page.click('button:has-text("Ingresar")');
};

/*
Crea un Usuario de oficina via la UI real del Menu Admin (no por API directa) - ademas de dejar la cuenta
lista para el resto del spec, esto mismo ejerce el flujo de "Nuevo Usuario" de punta a punta.
*/
export const crearUsuarioOficina = async (
  page: Page,
  datos: { nombre_completo: string; usuario: string; clave: string; cargo: 'ADMIN' | 'ASISTENTE' | 'SUPERVISOR' | 'ESCANER' }
): Promise<void> => {
  await page.goto('/admin');
  await page.click('button:has-text("Nuevo Usuario")');
  await page.fill('input[name="nombre_completo"]', datos.nombre_completo);
  await page.fill('input[name="usuario"]', datos.usuario);
  await page.fill('input[name="clave"]', datos.clave);
  await page.selectOption('select[name="cargo"]', datos.cargo);
  await page.click('button:has-text("Guardar")');
  // .code-badge (la celda "Usuario" de la tabla), no un texto suelto: el toast de exito tambien contiene el
  // nombre de usuario ('Usuario "X" creado correctamente'), un locator por texto plano matchea los dos.
  await expect(page.locator('.code-badge', { hasText: datos.usuario })).toBeVisible();
};
