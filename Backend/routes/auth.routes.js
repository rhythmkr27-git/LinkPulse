import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import User from '../models/usermodel.js';
import { requireAuth, setAuthCookie, cookieOptions } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { HttpError } from '../middleware/error.js';

const router = Router();
const registerSchema = z.object({
  username: z.string().trim().min(3).max(60).regex(/^[a-zA-Z0-9_.-]+$/, 'Username can contain letters, numbers, dots, underscores and hyphens'),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(8).max(72),
});
const loginSchema = z.object({ username: z.string().trim().min(1).max(254), password: z.string().min(1).max(72) });

router.post('/register', authLimiter, validate(registerSchema), async (req, res) => {
  const { username, email, password } = req.valid.body;
  try {
    const user = await User.create({ username, email, passwordHashed: await bcrypt.hash(password, 10) });
    return res.status(201).json({ message: 'Account created successfully', user: { id: String(user._id), username: user.username, email: user.email, role: user.role } });
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, 'Username or email is already registered');
    throw err;
  }
});

router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  const { username, password } = req.valid.body;
  const user = await User.findOne({ $or: [{ username }, { email: username.toLowerCase() }] }).select('+passwordHashed');
  if (!user || !(await bcrypt.compare(password, user.passwordHashed))) {
    throw new HttpError(401, 'Invalid username/email or password');
  }
  setAuthCookie(res, user);
  return res.json({ message: 'Logged in successfully', user: { id: String(user._id), username: user.username, email: user.email, role: user.role } });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));
router.post('/logout', (_req, res) => {
  res.clearCookie('token', cookieOptions);
  res.clearCookie('accessToken', cookieOptions);
  res.json({ message: 'Logged out' });
});
export default router;
