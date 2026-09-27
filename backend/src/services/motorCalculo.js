// Motor matemático del cotizador: reglas de negocio de Cintac.
import { getTarifasActivasPorRuta } from './tariffService.js';

const LIMITE_TN_POR_CONTENEDOR = 25;
const IMPUESTO_CIF = 0.19;
const MAX_CONTENEDORES = 10;

export async function calcularCotizacion(entrada) {
  const { origen, destino, tipoContenedor, pesoKg, diasContingencia = 0 } = entrada;

  const toneladas = pesoKg / 1000;
  const contenedores = Math.ceil(toneladas / LIMITE_TN_POR_CONTENEDOR);

  if (contenedores < 1) {
    const err = new Error('El peso debe resultar en al menos 1 contenedor.');
    err.status = 422;
    throw err;
  }
  if (contenedores > MAX_CONTENEDORES) {
    const err = new Error(`El peso (${toneladas.toFixed(2)} TN) supera el máximo de ${MAX_CONTENEDORES} contenedores por cotización.`);
    err.status = 422;
    throw err;
  }

  const tarifas = await getTarifasActivasPorRuta(origen, destino);
  if (tarifas.length === 0) {
    const err = new Error(`No hay tarifas registradas para la ruta ${origen} → ${destino}.`);
    err.status = 404;
    throw err;
  }

  const opciones = tarifas.map((t) => {
    const fleteUnitario = tipoContenedor === '20' ? t.flete20 : t.flete40;
    const fleteTotal = fleteUnitario * contenedores;
    const impuestoCIF = fleteTotal * IMPUESTO_CIF;
    const totalConImpuesto = fleteTotal + impuestoCIF;
    const tiempoTotalDias = t.transitoDias + diasContingencia;

    return {
      tarifaId: t.tarifaId,
      embarcadorId: t.embarcadorId,
      embarcador: t.embarcador,
      fleteUnitario,
      fleteTotal,
      impuestoCIF,
      totalConImpuesto,
      transitoBaseDias: t.transitoDias,
      tiempoTotalDias,
    };
  }).sort((a, b) => a.totalConImpuesto - b.totalConImpuesto);

  return {
    origen,
    destino,
    tipoContenedor,
    pesoKg,
    pesoToneladas: toneladas,
    contenedores,
    diasContingencia,
    limiteTnPorContenedor: LIMITE_TN_POR_CONTENEDOR,
    impuestoPorcentaje: IMPUESTO_CIF,
    tariffImportId: tarifas[0].importId,
    tariffImportVersion: tarifas[0].importVersion,
    opciones,
    mejorOpcion: opciones[0].embarcador,
  };
}
