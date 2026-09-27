import { query, withTransaction } from '../database/db.js';

export async function guardarCotizacion(resultado, usuarioId) {
  return withTransaction(async (client) => {
    const { rows: quoteRows } = await client.query(`
      INSERT INTO quotes (
        user_id,
        origin_port_id,
        destination_port_id,
        container_type,
        weight_kg,
        weight_tons,
        containers_required,
        contingency_days,
        tariff_import_id,
        calculation_tax_rate
      )
      SELECT
        $1,
        po.id,
        pd.id,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10
      FROM ports po
      CROSS JOIN ports pd
      WHERE LOWER(po.name) = LOWER($2)
        AND LOWER(pd.name) = LOWER($3)
      RETURNING id, created_at
    `, [
      usuarioId,
      resultado.origen,
      resultado.destino,
      resultado.tipoContenedor,
      resultado.pesoKg,
      resultado.pesoToneladas,
      resultado.contenedores,
      resultado.diasContingencia,
      resultado.tariffImportId,
      resultado.impuestoPorcentaje,
    ]);

    if (quoteRows.length !== 1) {
      const err = new Error('No fue posible asociar los puertos de la cotización.');
      err.status = 422;
      throw err;
    }

    const quote = quoteRows[0];

    for (const opcion of resultado.opciones) {
      await client.query(`
        INSERT INTO quote_options (
          quote_id,
          tariff_id,
          carrier_id,
          unit_freight_usd,
          total_freight_usd,
          tax_cif_usd,
          total_usd,
          base_transit_days,
          total_days,
          is_recommended,
          tariff_snapshot
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
      `, [
        quote.id,
        opcion.tarifaId,
        opcion.embarcadorId,
        opcion.fleteUnitario,
        opcion.fleteTotal,
        opcion.impuestoCIF,
        opcion.totalConImpuesto,
        opcion.transitoBaseDias,
        opcion.tiempoTotalDias,
        opcion.embarcador === resultado.mejorOpcion,
        JSON.stringify({
          embarcador: opcion.embarcador,
          fleteUnitario: opcion.fleteUnitario,
          fleteTotal: opcion.fleteTotal,
          impuestoCIF: opcion.impuestoCIF,
          totalConImpuesto: opcion.totalConImpuesto,
          transitoBaseDias: opcion.transitoBaseDias,
          tiempoTotalDias: opcion.tiempoTotalDias,
          tarifaId: opcion.tarifaId,
        }),
      ]);
    }

    await client.query(`
      INSERT INTO audit_logs (user_id, action, entity, entity_id, details)
      VALUES ($1, 'CREATE_QUOTE', 'quotes', $2, $3::jsonb)
    `, [usuarioId, quote.id, JSON.stringify({
      origen: resultado.origen,
      destino: resultado.destino,
      tipoContenedor: resultado.tipoContenedor,
      contenedores: resultado.contenedores,
      tariffImportId: resultado.tariffImportId,
    })]);

    return {
      id: quote.id,
      createdAt: quote.created_at,
    };
  });
}

export async function getCotizacionesDeUsuario(usuarioId) {
  const { rows } = await query(`
    SELECT
      q.id,
      q.created_at,
      po.name AS origen,
      pd.name AS destino,
      q.container_type AS tipo_contenedor,
      q.weight_kg AS peso_kg,
      q.weight_tons AS peso_toneladas,
      q.containers_required AS contenedores,
      q.contingency_days AS dias_contingencia,
      qo.total_usd AS total_recomendado,
      qo.carrier_id,
      c.name AS embarcador_recomendado
    FROM quotes q
    INNER JOIN ports po ON po.id = q.origin_port_id
    INNER JOIN ports pd ON pd.id = q.destination_port_id
    LEFT JOIN quote_options qo ON qo.quote_id = q.id AND qo.is_recommended = TRUE
    LEFT JOIN carriers c ON c.id = qo.carrier_id
    WHERE q.user_id = $1
    ORDER BY q.created_at DESC
    LIMIT 100
  `, [usuarioId]);
  return rows;
}

export async function getCotizacionPorId(id, usuarioId) {
  const { rows: quotes } = await query(`
    SELECT
      q.id,
      q.created_at,
      po.name AS origen,
      pd.name AS destino,
      q.container_type AS tipo_contenedor,
      q.weight_kg AS peso_kg,
      q.weight_tons AS peso_toneladas,
      q.containers_required AS contenedores,
      q.contingency_days AS dias_contingencia
    FROM quotes q
    INNER JOIN ports po ON po.id = q.origin_port_id
    INNER JOIN ports pd ON pd.id = q.destination_port_id
    WHERE q.id = $1 AND q.user_id = $2
  `, [id, usuarioId]);

  if (quotes.length === 0) return null;

  const { rows: options } = await query(`
    SELECT
      qo.id,
      qo.tariff_id,
      c.name AS embarcador,
      qo.unit_freight_usd,
      qo.total_freight_usd,
      qo.tax_cif_usd,
      qo.total_usd,
      qo.base_transit_days,
      qo.total_days,
      qo.is_recommended,
      qo.tariff_snapshot
    FROM quote_options qo
    INNER JOIN carriers c ON c.id = qo.carrier_id
    WHERE qo.quote_id = $1
    ORDER BY qo.total_usd ASC
  `, [id]);

  return { ...quotes[0], opciones: options };
}
