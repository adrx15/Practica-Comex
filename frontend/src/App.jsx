import { useState } from 'react';
import Login from './pages/Login.jsx';
import Cotizador from './pages/Cotizador.jsx';

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [usuario, setUsuario] = useState(() => localStorage.getItem('usuario') || '');

  const entrar = (tok, nombre) => {
    localStorage.setItem('token', tok);
    localStorage.setItem('usuario', nombre);
    setToken(tok);
    setUsuario(nombre);
  };

  const salir = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setToken(null);
    setUsuario('');
  };

  if (!token) return <Login onLogin={entrar} />;
  return <Cotizador usuario={usuario} onLogout={salir} />;
}
