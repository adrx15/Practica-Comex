// GET /api/v1/puertos — catálogo dinámico desde PostgreSQL
import { Router } from 'express';
import { getPuertos } from '../services/portService.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    res.json(await getPuertos());
  } catch (err) {
    console.error('Error obteniendo puertos:', err);
    res.status(err.status ?? 500).json({ error: 'No fue posible cargar el catálogo de puertos.' });
  }
});

export default router;
