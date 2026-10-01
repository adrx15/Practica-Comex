// Cliente HTTP contra la API REST del backend
const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const BASE = `${API_URL}/api/v1`;

function token() {
  return localStorage.getItem('token');
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

export const api = {
  login: (usuario, password) =>
    request('/auth/login', { method: 'POST', body: { usuario, password } }),

  getPuertos: () => request('/puertos'),

  calcular: (payload) =>
    request('/cotizaciones/calcular', { method: 'POST', body: payload }),

  uploadPlanilla: (file) => {
    const fd = new FormData();
    fd.append('planilla', file);
    return request('/tarifas/upload', { method: 'POST', body: fd });
  },
};
