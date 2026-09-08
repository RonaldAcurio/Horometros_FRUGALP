import express, {Application} from 'express';
import cors from 'cors';
import horometrosRoutes from './routes/horometros.routees';
import asistenciaRoutes from './routes/asistencia.rutes';
import router from './routes/actividades.rutes';

const app: Application = express();

//Middleware Globales
app.use(cors());
app.use(express.json({ limit: '10mb' })); //permite recibir el string Base64 de la foto en el JSON
app.use(express.urlencoded({ limit:'10mb', extended:true }));

//Rutas
app.use('/api/horometros', horometrosRoutes);
app.use('/api/asistencia',asistenciaRoutes);
app.use('/api/actividad',router);

//Ruta de comprobacion de estado (Healthcheck)
app.get('/api/health', (_req,res)=>{
    res.json({
        status: 'ok',
        message: 'Backend de Horometros operativo'
    })
});

export default app;
