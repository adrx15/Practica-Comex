// POST /api/v1/auth/login — autenticación contra PostgreSQL
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { query } from '../database/db.js';
import { JWT_SECRET } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { usuario, password } = req.body ?? {};

  if (typeof usuario !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Debe ingresar usuario y contraseña.' });
  }
  if (usuario.trim().length < 1 || usuario.trim().length > 50 || password.length > 72) {
    return res.status(400).json({ error: 'Usuario o contraseña inválidos.' });
  }

  try {
    const { rows } = await query(`
      SELECT id, username, full_name, password_hash, role
      FROM users
      WHERE LOWER(username) = LOWER($1) AND active = TRUE
      LIMIT 1
    `, [usuario.trim()]);

    if (rows.length === 0 || !(await bcrypt.compare(password, rows[0].password_hash))) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    const user = rows[0];
    const token = jwt.sign(
      {
        userId: user.id,
        usuario: user.username,
        nombre: user.full_name,
        rol: user.role,
      },
      JWT_SECRET,
      { expiresIn: '8h' },
    );

    await query(`
      INSERT INTO audit_logs (user_id, action, entity, entity_id, details)
      VALUES ($1, 'LOGIN', 'users', $1, $2::jsonb)
    `, [user.id, JSON.stringify({ username: user.username })]);

    return res.json({ token, nombre: user.full_name, rol: user.role });
  } catch (err) {
    console.error('Error en login:', err);
    return res.status(err.status ?? 500).json({ error: 'No fue posible procesar el inicio de sesión.' });
  }
});

export default router;
