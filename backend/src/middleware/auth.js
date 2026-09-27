// Verificación de token JWT
import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'cintac-comex-secret-practica';

export function requiereToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Autenticación requerida.' });
  }

  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}
