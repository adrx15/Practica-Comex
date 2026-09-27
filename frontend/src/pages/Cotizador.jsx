import { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { api } from '../services/api.js';
import './Cotizador.css';

const fmt = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });

export default function Cotizador({ usuario, onLogout }) {
  const [puertos, setPuertos] = useState({ origenes: [], destinos: [] });
  const [form, setForm] = useState({
    origen: '',
    destino: '',
    tipoContenedor: '40',
    pesoKg: '',
    diasContingencia: '',
  });
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [archivo, setArchivo] = useState(null);
  const [msgUpload, setMsgUpload] = useState('');

  useEffect(() => {
    api.getPuertos().then(setPuertos).catch((e) => setError(e.message));
  }, []);

  const set = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  const calcular = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    setResultado(null);
    try {
      const data = await api.calcular({
        origen: form.origen,
        destino: form.destino,
        tipoContenedor: form.tipoContenedor,
        pesoKg: Number(form.pesoKg),
        diasContingencia: form.diasContingencia === '' ? 0 : Number(form.diasContingencia),
      });
      setResultado(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  const exportarPDF = () => {
    if (!resultado) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.setTextColor(194, 65, 12);
    doc.text('Cintac S.A. — Comex', 14, 18);
    doc.setFontSize(11);
    doc.setTextColor(68, 64, 60);
    doc.text('Cotización de Importación (Interna)', 14, 26);
    doc.setFontSize(9);
    doc.text(`Emitido: ${new Date().toLocaleString('es-CL')}  |  Usuario: ${usuario}`, 14, 32);

    autoTable(doc, {
      startY: 38,
      head: [['Parámetro', 'Valor']],
      body: [
        ['Origen', resultado.origen],
        ['Destino', resultado.destino],
        ['Contenedor', `${resultado.tipoContenedor} pies`],
        ['Peso', `${fmt.format(resultado.pesoKg)} kg (${fmt.format(resultado.pesoToneladas)} TN)`],
        ['Contenedores requeridos', String(resultado.contenedores)],
        ['Días de contingencia', String(resultado.diasContingencia)],
      ],
      styles: { fontSize: 10 },
      headStyles: { fillColor: [194, 65, 12] },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Embarcador', 'Flete unitario', 'Flete total', 'Impuesto 19%', 'Total CIF', 'Tránsito', 'Total días']],
      body: resultado.opciones.map(o => [
        o.embarcador,
        `$${fmt.format(o.fleteUnitario)}`,
        `$${fmt.format(o.fleteTotal)}`,
        `$${fmt.format(o.impuestoCIF)}`,
        `$${fmt.format(o.totalConImpuesto)}`,
        `${o.transitoBaseDias} días`,
        `${o.tiempoTotalDias} días`,
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [232, 89, 12] },
      alternateRowStyles: { fillColor: [250, 244, 240] },
    });

    const y = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(11);
    doc.setTextColor(21, 128, 61);
    doc.text(`Mejor opción: ${resultado.mejorOpcion}`, 14, y);
    doc.setFontSize(8);
    doc.setTextColor(120, 113, 108);
    doc.text('Documento de simulación interna — comparar contra ofertas de los embarcadores.', 14, y + 6);

    doc.save(`cotizacion_${resultado.origen}-${resultado.destino}.pdf`);
  };

  const subirPlanilla = async (e) => {
    e.preventDefault();
    if (!archivo) return;
    setMsgUpload('');
    setError('');
    try {
      const data = await api.uploadPlanilla(archivo);
      setMsgUpload(`Versión ${data.version} importada: ${data.rutas} tarifas cargadas en PostgreSQL.`);
      setArchivo(null);
      setResultado(null);
      const p = await api.getPuertos();
      setPuertos(p);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="cotizador">
      <header className="cotizador-header">
        <div className="cotizador-brand">
          <span className="cotizador-logo">C</span>
          <div>
            <h1>CINTAC</h1>
            <p>Cotizador de Importaciones — Comercio Exterior</p>
          </div>
        </div>
        <div className="cotizador-usuario">
          <span>{usuario}</span>
          <button onClick={onLogout} className="btn-salir">Salir</button>
        </div>
      </header>

      <main className="cotizador-main">
        <section className="panel">
          <h2>Simulación de Fletes</h2>
          <form onSubmit={calcular} className="form-grid">
            <label>
              Puerto de Origen
              <select value={form.origen} onChange={set('origen')} required>
                <option value="">Seleccione…</option>
                {puertos.origenes.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label>
              Puerto de Destino
              <select value={form.destino} onChange={set('destino')} required>
                <option value="">Seleccione…</option>
                {puertos.destinos.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label>
              Tipo de Contenedor
              <select value={form.tipoContenedor} onChange={set('tipoContenedor')}>
                <option value="20">20 pies</option>
                <option value="40">40 pies</option>
              </select>
            </label>
            <label>
              Peso de la carga (kg)
              <input
                type="number"
                min="1"
                step="any"
                value={form.pesoKg}
                onChange={set('pesoKg')}
                placeholder="Ej: 25000"
                required
              />
            </label>
            <label className="campo-ancho">
              Días de contingencia (opcional)
              <input
                type="number"
                min="0"
                max="60"
                step="1"
                value={form.diasContingencia}
                onChange={set('diasContingencia')}
                placeholder="Ej: 5 — por tifones o desvíos de ruta"
              />
            </label>

            <div className="campo-ancho">
              <button type="submit" className="btn-primario" disabled={cargando}>
                {cargando ? 'Calculando…' : 'Calcular cotización'}
              </button>
            </div>
          </form>

          {error && <div className="alerta-error">{error}</div>}

          {resultado && (
            <div className="resultado">
              <div className="resumen">
                <div>
                  <strong>{resultado.origen} → {resultado.destino}</strong>
                  <p>
                    {fmt.format(resultado.pesoKg)} kg = {fmt.format(resultado.pesoToneladas)} TN
                    {' '}· Máx. {resultado.limiteTnPorContenedor} TN/contenedor
                    {' '}· {resultado.contenedores} contenedor(es) de {resultado.tipoContenedor} pies
                  </p>
                </div>
                <button onClick={exportarPDF} className="btn-pdf">Exportar PDF</button>
              </div>

              <table className="tabla">
                <thead>
                  <tr>
                    <th>Embarcador</th>
                    <th>Flete unitario</th>
                    <th>Flete total</th>
                    <th>Impuesto 19%</th>
                    <th>Total CIF</th>
                    <th>Tránsito base</th>
                    <th>Total días</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.opciones.map((o, i) => (
                    <tr key={o.embarcador} className={i === 0 ? 'fila-mejor' : ''}>
                      <td>
                        {o.embarcador}
                        {i === 0 && <span className="badge">Mejor precio</span>}
                      </td>
                      <td>${fmt.format(o.fleteUnitario)}</td>
                      <td>${fmt.format(o.fleteTotal)}</td>
                      <td>${fmt.format(o.impuestoCIF)}</td>
                      <td><strong>${fmt.format(o.totalConImpuesto)}</strong></td>
                      <td>{o.transitoBaseDias} días</td>
                      <td>{o.tiempoTotalDias} días</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel panel-master">
          <h2>Planilla Maestra</h2>
          <p className="ayuda">
            El Excel/CSV se usa para importar una nueva versión de tarifas. Los datos operativos
            y las cotizaciones quedan almacenados en PostgreSQL; la versión anterior se conserva.
          </p>
          <form onSubmit={subirPlanilla} className="upload">
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={(e) => setArchivo(e.target.files[0] || null)}
            />
            <button type="submit" className="btn-secundario" disabled={!archivo}>
              Importar nueva versión
            </button>
          </form>
          {msgUpload && <div className="alerta-ok">{msgUpload}</div>}
        </section>
      </main>
    </div>
  );
}