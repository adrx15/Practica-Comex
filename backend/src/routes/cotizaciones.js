// Cotizador y persistencia de cotizaciones
import { Router } from 'express';
import { calcularCotizacion } from '../services/motorCalculo.js';
import { guardarCotizacion, getCotizacionesDeUsuario, getCotizacionPorId } from '../services/quoteService.js';
import { requiereToken } from '../middleware/auth.js';

const router = Router();

function esPuertoValido(v) {
  return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 60;
}

router.post('/calcular', requiereToken, async (req, res) => {
  const { origen, destino, tipoContenedor, pesoKg, diasContingencia } = req.body ?? {};

  if (!esPuertoValido(origen) || !esPuertoValido(destino)) {
    return res.status(400).json({ error: 'Debe seleccionar un puerto de origen y uno de destino válidos.' });
  }
  if (tipoContenedor !== '20' && tipoContenedor !== '40') {
    return res.status(400).json({ error: 'El tipo de contenedor debe ser 20 o 40.' });
  }

  const peso = Number(pesoKg);
  if (!Number.isFinite(peso) || peso <= 0 || peso > 1_000_000) {
    return res.status(400).json({ error: 'El peso en kilogramos debe ser un número mayor a 0 (máx. 1.000.000 kg).' });
  }

  let dias = 0;
  if (diasContingencia !== undefined && diasContingencia !== null && diasContingencia !== '') {
    dias = Number(diasContingencia);
    if (!Number.isInteger(dias) || dias < 0 || dias > 60) {
      return res.status(400).json({ error: 'Los días de contingencia deben ser un entero entre 0 y 60.' });
    }
  }

  try {
    const resultado = await calcularCotizacion({
      origen: origen.trim(),
      destino: destino.trim(),
      tipoContenedor,
      pesoKg: peso,
      diasContingencia: dias,
    });

    const guardado = await guardarCotizacion(resultado, req.usuario.userId);
    return res.json({
      ...resultado,
      cotizacionId: guardado.id,
      creadoEn: guardado.createdAt,
    });
  } catch (err) {
    console.error('Error calculando cotización:', err);
    return res.status(err.status ?? 500).json({ error: err.message });
  }
});

router.get('/', requiereToken, async (req, res) => {
  try {
    res.json(await getCotizacionesDeUsuario(req.usuario.userId));
  } catch (err) {
    res.status(err.status ?? 500).json({ error: 'No fue posible consultar el historial de cotizaciones.' });
  }
});

router.get('/:id', requiereToken, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Identificador de cotización inválido.' });
  }

  try {
    const cotizacion = await getCotizacionPorId(id, req.usuario.userId);
    if (!cotizacion) return res.status(404).json({ error: 'Cotización no encontrada.' });
    return res.json(cotizacion);
  } catch (err) {
    return res.status(err.status ?? 500).json({ error: 'No fue posible consultar la cotización.' });
  }
});

export default router;
