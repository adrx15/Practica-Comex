import { useState } from 'react';
import { api } from '../services/api.js';
import './Login.css';

export default function Login({ onLogin }) {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const data = await api.login(usuario.trim(), password);
      onLogin(data.token, data.nombre);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="login-pagina">
      <form className="login-tarjeta" onSubmit={submit}>
        <div className="login-logo">
          <span className="login-logo-icono">C</span>
          <h1>CINTAC</h1>
          <p className="login-subtitulo">Comercio Exterior — Cotizador de Importaciones</p>
        </div>

        <label>
          Usuario
          <input
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            placeholder="jefatura o analista"
            autoFocus
            required
          />
        </label>

        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </label>

        {error && <div className="login-error">{error}</div>}

        <button type="submit" disabled={cargando}>
          {cargando ? 'Ingresando…' : 'Ingresar'}
        </button>

        <p className="login-demo">
          Prototipo: usuario <b>jefatura</b> o <b>analista</b> — clave <b>comex2024</b>
        </p>
      </form>
    </div>
  );
}
