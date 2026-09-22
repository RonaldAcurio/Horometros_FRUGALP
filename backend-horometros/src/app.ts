import express, {Application} from 'express';
import cors from 'cors';
import horometrosRoutes from './routes/horometros.routees';
import asistenciaRoutes from './routes/asistencia.rutes';
import router from './routes/actividades.rutes';
import authRoutes from './routes/auth.rutes'; 
import registroActividadRutes from './routes/registro_actividad.rutes';
import haciendaRoutes from './routes/hacienda.rutes';
import usuarioRoutes from './routes/usuario.rutes';
import equipoRoutes from './routes/equipo.rutes';

const app: Application = express();

//Middleware Globales
app.use(cors());
app.use(express.json({ limit: '10mb' })); //permite recibir el string Base64 de la foto en el JSON
app.use(express.urlencoded({ limit:'10mb', extended:true }));

//Rutas
app.use('/api/horometros', horometrosRoutes);
app.use('/api/asistencia',asistenciaRoutes);
app.use('/api/actividad',router);
app.use('/api/auth',authRoutes);
app.use('/api/registro-actividades',registroActividadRutes);
app.use('/api/haciendas',haciendaRoutes);
app.use('/api/usuarios',usuarioRoutes);
app.use('/api/equipos',equipoRoutes);

//Ruta de comprobacion de estado (Healthcheck)
app.get('/api/health', (_req,res)=>{
    res.json({
        status: 'ok',
        message: 'Backend de Horometros operativo'
    })
});

export default app;
