import express, {Application} from 'express';
import cors from 'cors';
import helmet from 'helmet';
import asistenciaRoutes from './routes/asistencia.rutes';
import router from './routes/actividades.rutes';
import authRoutes from './routes/auth.rutes';
import registroActividadRutes from './routes/registro_actividad.rutes';
import haciendaRoutes from './routes/hacienda.rutes';
import usuarioRoutes from './routes/usuario.rutes';
import equipoRoutes from './routes/equipo.rutes';
import auditoriaRoutes from './routes/auditoria.rutes';

const app: Application = express();

/*
Render/Railway ponen la app detras de su propio proxy inverso: sin esto, Express ve la IP del proxy en TODAS las
peticiones (no la del cliente real), lo que rompe el rate limiting de arriba - o bien todo el mundo comparte un
solo balde (si el proxy siempre pega desde la misma IP interna), o directamente falla, porque express-rate-limit
v8+ valida que `trust proxy` este configurado a proposito antes de confiar en X-Forwarded-For. `1` = confiar en
un solo salto de proxy hacia atras (el de la plataforma), suficiente para este caso.
*/
app.set('trust proxy', 1);

/*
CORS_ORIGIN: lista de dominios permitidos separados por coma (ej. "https://horometros-frugalp.vercel.app,
https://midominio.com"), para agregar sin tocar codigo el dia que sumen un dominio propio u otro deploy de
Vercel. Si la variable no esta configurada en el entorno, cae al dominio real de produccion en Vercel (el
"Domain" estable del proyecto, no las URLs de preview con hash que cambian en cada deploy) + localhost para
desarrollo - antes `cors()` sin argumentos aceptaba CUALQUIER origen, cualquier sitio en internet podia llamar a
esta API usando la sesion de quien la tuviera abierta.

IMPORTANTE si CORS_ORIGIN SI esta configurada en el entorno (Render): 'https://localhost' tiene que estar en
esa lista tambien (ver CLAUDE.md, "Empaquetado con Capacitor") - la app empaquetada de Android sirve el
contenido desde ese origen fijo (el WebView de Capacitor, no el dominio de Vercel), asi que sin esto el login
fallaria con el mismo error de CORS que el del navegador, pero DENTRO de la app instalada en el celular.
*/
const origenesPermitidos = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : ['https://horometros-frugalp.vercel.app', 'http://localhost:4200', 'https://localhost'];

//Middleware Globales
app.use(helmet());
app.use(cors({ origin: origenesPermitidos }));
app.use(express.json({ limit: '10mb' })); //permite recibir el string Base64 de la foto en el JSON
app.use(express.urlencoded({ limit:'10mb', extended:true }));

//Rutas
app.use('/api/asistencia',asistenciaRoutes);
app.use('/api/actividad',router);
app.use('/api/auth',authRoutes);
app.use('/api/registro-actividades',registroActividadRutes);
app.use('/api/haciendas',haciendaRoutes);
app.use('/api/usuarios',usuarioRoutes);
app.use('/api/equipos',equipoRoutes);
app.use('/api/auditoria',auditoriaRoutes);

//Ruta de comprobacion de estado (Healthcheck)
app.get('/api/health', (_req,res)=>{
    res.json({
        status: 'ok',
        message: 'Backend de Horometros operativo'
    })
});

export default app;
