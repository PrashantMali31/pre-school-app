import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export const newRefreshToken = () => crypto.randomBytes(48).toString('hex');
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export const slugify = (name: string) =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'school';

export const todayISO = () => new Date().toISOString().slice(0, 10);
