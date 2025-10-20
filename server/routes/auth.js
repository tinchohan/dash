import { Router } from 'express';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { user, pass } = req.body || {};
  if (user === 'H4' && pass === 'SRL') {
    req.session.isAuth = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
});

authRouter.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

export function requireAuth(req, res, next) {
  if (req.session && req.session.isAuth) return next();
  return res.status(401).json({ error: 'No autorizado' });
}


