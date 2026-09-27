import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.js';
import puertosRoutes from './routes/puertos.js';
import cotizacionesRoutes from './routes/cotizaciones.js';
import tarifasRoutes from './routes/tarifas.js';
import { query } from './database/db.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const limiterGlobal = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intente nuevamente en un minuto.' },
});
app.use('/api', limiterGlobal);

const limiterCalculo = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Límite de cotizaciones por minuto alcanzado.' },
});

app.get('/api/v1/salud', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true, servicio: 'cintac-comex-api', database: 'postgresql' });
  } catch (err) {
    res.status(503).json({ ok: false, servicio: 'cintac-comex-api', database: 'unavailable' });
  }
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/puertos', puertosRoutes);
app.use('/api/v1/cotizaciones', limiterCalculo, cotizacionesRoutes);
app.use('/api/v1/tarifas', tarifasRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Recurso no encontrado.' }));

app.listen(PORT, () => {
  console.log(`API Cintac Comex escuchando en http://localhost:${PORT}`);
});
