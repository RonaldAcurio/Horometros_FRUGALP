import express, {Application} from 'express';
import cors from 'cors';
import horometrosRoutes from './routes/horometros.routees';
import asistenciaRoutes from './routes/asistencia.rutes';

const app: Application = express();

//Middleware Globales
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended:true }));

//Rutas
app.use('/api/horometros', horometrosRoutes);
app.use('/api/asistencia',asistenciaRoutes);

//Ruta de comprobacion de estado (Healthcheck)
app.get('/api/health', (_req,res)=>{
    res.json({
        status: 'ok',
        message: 'Backend de Horometros operativo'
    })
});

export default app;
