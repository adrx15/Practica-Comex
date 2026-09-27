// POST /api/v1/tarifas/upload — importa una nueva versión de la planilla a PostgreSQL
import { Router } from 'express';
import multer from 'multer';
import { requiereToken } from '../middleware/auth.js';
import { importarPlanilla } from '../services/excelImportService.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const EXTENSIONES_OK = ['.xlsx', '.csv'];

router.post('/upload', requiereToken, (req, res) => {
  upload.single('planilla')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: 'Archivo inválido o demasiado grande (máx. 5 MB).' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Debe adjuntar un archivo con nombre "planilla".' });
    }

    const nombre = (req.file.originalname || '').toLowerCase();
    const ext = nombre.includes('.') ? nombre.slice(nombre.lastIndexOf('.')) : '';
    if (!EXTENSIONES_OK.includes(ext)) {
      return res.status(415).json({ error: 'Tipo de archivo no permitido. Use .xlsx o .csv.' });
    }

    try {
      const resultado = await importarPlanilla(req.file.buffer, req.file.originalname, req.usuario.userId);
      return res.json({
        mensaje: 'Planilla importada correctamente a PostgreSQL.',
        version: resultado.version,
        rutas: resultado.rows,
        checksum: resultado.checksum,
      });
    } catch (e) {
      console.error('Error importando tarifas:', e);
      return res.status(e.status ?? 500).json({ error: e.message });
    }
  });
});

export default router;
