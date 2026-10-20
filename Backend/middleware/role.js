import { HttpError } from './error.js';

export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) throw new HttpError(403, 'Forbidden');
    next();
  };