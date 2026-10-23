import { APIRequestContext, Page, expect } from '@playwright/test';

// Helpers compartidos por los specs de e2e/ (ver CLAUDE.md, "Pruebas end-to-end").

const API = 'http://localhost:3000/api';
const ADMIN_E2E = { usuario: 'e2e_admin', clave: 'E2ePrueba123' };

/*
Setup vía API directa (no vía UI) para datos que NO son lo que el spec está probando (Hacienda, Supervisor,
Operador, Token, catálogo de Equipo/Actividad) - a diferencia de crearUsuarioOficina (arriba), que SÍ ejerce a
propósito la UI de "Nuevo Usuario" porque ESE es justamente el flujo bajo prueba en sus specs. Acá el flujo bajo
prueba es otro (resumen de horas antes de cerrar jornada / exportar Excel de todas las haciendas) - armar el
escenario por API es más rápido y no esconde ningún bug real, ya que ninguno de los specs de mi-jornada/excel
verifica la creación de Hacienda/Operador en sí.
*/
export const crearEscenarioDeTrabajador = async (
  request: APIRequestContext,
  sufijo: string,
): Promise<{ hacienda: { id: number; nombre: string }; tokenHacienda: string; supervisorId: number; operadorUsuario: string; operadorClave: string }> => {
  const loginResp = await request.post(`${API}/auth/login`, { data: ADMIN_E2E });
  const { token } = await loginResp.json();
  const headers = { Authorization: `Bearer ${token}` };

  const hacienda = await (await request.post(`${API}/haciendas`, {
    headers, data: { nombre: `E2E Hacienda ${sufijo}` },
  })).json();

  const tokenResp = await (await request.post(`${API}/haciendas/${hacienda.id}/token`, { headers, data: {} })).json();

  const supervisor = await (await request.post(`${API}/usuarios`, {
    headers,
    data: {
      nombre_completo: `E2E Supervisor ${sufijo}`, usuario: `e2e_sup_${sufijo}`, clave: 'ClaveSup123',
      cargo: 'SUPERVISOR', hacienda_id: hacienda.id,
    },
  })).json();

  const operadorUsuario = `e2e_op_${sufijo}`;
  const operadorClave = 'ClaveOp123';
  const operadorResp = await request.post(`${API}/asistencia/operadores`, {
    headers,
    data: {
      nombre_completo: `E2E Trabajador ${sufijo}`, codigo_megued: `OP${sufijo}`.slice(0, 20), rol: 'MECANICO',
      supervisor_id: supervisor.id, usuario: operadorUsuario, clave: operadorClave,
    },
  });
  if (!operadorResp.ok()) throw new Error(`No se pudo crear el operador de prueba: ${await operadorResp.text()}`);

  return { hacienda, tokenHacienda: tokenResp.token_actual, supervisorId: supervisor.id, operadorUsuario, operadorClave };
};

// Catálogo mínimo (Equipo + Actividad) que el autocompletar del Panel de Actividades necesita para
// encontrar algo al escribir - sin esto no hay nada que seleccionar y "Iniciar labor" queda bloqueado.
export const crearCatalogoMinimo = async (
  request: APIRequestContext,
  sufijo: string,
): Promise<{ equipoId: number; equipoNombre: string; actividadId: number; actividadDescripcion: string }> => {
  const loginResp = await request.post(`${API}/auth/login`, { data: ADMIN_E2E });
  const { token } = await loginResp.json();
  const headers = { Authorization: `Bearer ${token}` };

  const equipoNombre = `E2E Equipo ${sufijo}`;
  const actividadDescripcion = `E2E Actividad ${sufijo}`;
  const equipo = await (await request.post(`${API}/equipos`, { headers, data: { codigo_megued: `EQE2E${sufijo}`, nombre_equipo: equipoNombre } })).json();
  const actividad = await (await request.post(`${API}/actividad/nueva`, { headers, data: { codigo_megued: `ACE2E${sufijo}`, description: actividadDescripcion } })).json();

  return { equipoId: equipo.id, equipoNombre, actividadId: actividad.id, actividadDescripcion };
};

/*
Jornada completa de un trabajador, de punta a punta, vía API directa (entrada por código -> una labor
cerrada -> salida por código -> O/X del Supervisor -> Cierre del día) - lo que necesita el Historial de
Asistencia para mostrar algo (ver CLAUDE.md, regla 6: solo jornadas cerradas Y confirmadas). Usado por specs
que prueban el Historial/Excel, donde la jornada en sí es solo el dato de fondo, no lo que se está probando
(eso ya lo cubre mi-jornada-resumen-salida.spec.ts, que SÍ la hace vía UI real).
*/
export const completarJornadaDeHoyViaApi = async (
  request: APIRequestContext,
  datos: {
    tokenHacienda: string; supervisorId: number; operadorUsuario: string; operadorClave: string;
    equipoId: number; actividadId: number; horaInicio: string; horaFin: string;
  },
): Promise<void> => {
  const loginOperador = await (await request.post(`${API}/auth/login`, {
    data: { usuario: datos.operadorUsuario, clave: datos.operadorClave },
  })).json();
  const headersOperador = { Authorization: `Bearer ${loginOperador.token}` };

  const entrada = await (await request.post(`${API}/asistencia/marcar-mi-codigo`, {
    headers: headersOperador, data: { token_hacienda: datos.tokenHacienda },
  })).json();
  const asistenciaId = entrada.asistencia.id;

  const registro = await (await request.post(`${API}/registro-actividades`, {
    headers: headersOperador,
    data: { asistencia_id: asistenciaId, equipo_id: datos.equipoId, actividad_id: datos.actividadId, hora_inicio: datos.horaInicio },
  })).json();
  await request.put(`${API}/registro-actividades/${registro.id}/finalizar`, {
    headers: headersOperador, data: { hora_fin: datos.horaFin },
  });

  // Salida: mismo endpoint/token que la entrada - procesarMarcacion (backend) decide solo que esto es un cierre,
  // porque ya existe una jornada EN_JORNADA de hoy para este operador (ver CLAUDE.md, "Camino A").
  await request.post(`${API}/asistencia/marcar-mi-codigo`, { headers: headersOperador, data: { token_hacienda: datos.tokenHacienda } });

  const loginAdmin = await (await request.post(`${API}/auth/login`, { data: ADMIN_E2E })).json();
  const headersAdmin = { Authorization: `Bearer ${loginAdmin.token}` };
  await request.put(`${API}/asistencia/${asistenciaId}/confirmar`, { headers: headersAdmin, data: { presente: true } });
  await request.post(`${API}/asistencia/finalizar-dia`, { headers: headersAdmin, data: { supervisor_id: datos.supervisorId } });
};

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
