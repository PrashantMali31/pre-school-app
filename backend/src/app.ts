import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { authRoutes } from './modules/auth/routes';
import { tenantRoutes } from './modules/tenants/routes';
import { optionsRoutes } from './modules/options/routes';
import { classRoutes } from './modules/classes/routes';
import { studentRoutes } from './modules/students/routes';
import { teacherRoutes } from './modules/teachers/routes';
import { attendanceRoutes } from './modules/attendance/routes';
import { invoiceRoutes } from './modules/invoices/routes';
import { eventRoutes } from './modules/events/routes';
import { announcementRoutes } from './modules/announcements/routes';
import { enquiryRoutes } from './modules/enquiries/routes';
import { importRoutes } from './modules/import/routes';
import { inviteRoutes } from './modules/invites/routes';
import { paymentRoutes } from './modules/payments/routes';
import { commsRoutes } from './modules/comms/routes';
import { auditRoutes } from './modules/audit/routes';
import { safetyRoutes } from './modules/safety/routes';
import { staffRoutes } from './modules/staff/routes';
import { billingRoutes } from './modules/billing/routes';

export function buildApp() {
  const app = Fastify({ logger: true });

  // Fail fast on weak/missing JWT secret in production; warn in dev on fallback.
  const JWT_SECRET = process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && (!JWT_SECRET || JWT_SECRET.length < 32)) {
    throw new Error('JWT_SECRET must be set and at least 32 characters in production.');
  }
  const jwtSecret = JWT_SECRET ?? 'dev-only-change-me-min-32-chars-please';
  if (!JWT_SECRET && !isProd) {
    console.warn('[warn] JWT_SECRET not set — using insecure dev fallback. Set JWT_SECRET (min 32 chars) in production.');
  }

  app.register(helmet);
  // NOTE: `methods` must list every verb the frontend uses — the @fastify/cors
  // default is only GET,HEAD,POST, which silently breaks browser PUT/PATCH/DELETE
  // (preflight 204 without the method → fetch throws "Failed to fetch").
  app.register(cors, { origin: (process.env.FRONTEND_URL ?? 'http://localhost:3000').split(','), credentials: true, methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] });
  app.register(cookie);
  app.register(rateLimit, { max: 200, timeWindow: '1 minute' });
  app.register(jwt, {
    secret: jwtSecret,
    sign: { expiresIn: '15m' },
  });

  // Tolerate `Content-Type: application/json` with an empty body (bodiless
  // POST/DELETE from generic HTTP clients). Empty -> undefined so zod
  // schemas fail with 400 VALIDATION instead of a parser 400.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    try {
      if (body === '' || body === undefined || body === null) return done(null, undefined);
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error);
    }
  });

  app.get('/health', async () => ({ ok: true, service: 'preschool-api', time: new Date().toISOString() }));

  app.register(authRoutes, { prefix: '/auth' });
  app.register(tenantRoutes, { prefix: '/tenants' });
  app.register(optionsRoutes, { prefix: '/options' });
  app.register(classRoutes, { prefix: '/classes' });
  app.register(studentRoutes, { prefix: '/students' });
  app.register(teacherRoutes, { prefix: '/teachers' });
  app.register(attendanceRoutes, { prefix: '/attendance' });
  app.register(invoiceRoutes, { prefix: '/invoices' });
  app.register(eventRoutes, { prefix: '/events' });
  app.register(announcementRoutes, { prefix: '/announcements' });
  app.register(enquiryRoutes, { prefix: '/enquiries' });
  app.register(importRoutes, { prefix: '/import' });
  app.register(inviteRoutes, { prefix: '/invites' });
  app.register(paymentRoutes, { prefix: '/payments' });
  app.register(commsRoutes, { prefix: '/comms' });
  app.register(auditRoutes, { prefix: '/audit' });
  app.register(safetyRoutes, { prefix: '/safety' });
  app.register(staffRoutes, { prefix: '/staff' });
  app.register(billingRoutes, { prefix: '/billing' });

  app.setErrorHandler((err: unknown, _req, reply) => {
    app.log.error(err);
    const e = err as { statusCode?: number; code?: string | number; message?: string };
    const msg = e.message ?? '';
    // Map invalid-UUID / postgres 22P02 errors to 400 VALIDATION instead of 500.
    if (e.code === '22P02' || /invalid input syntax|invalid[^a-z0-9]{0,20}(uuid|guid)|22P02/i.test(msg)) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid ID format.' } });
    }
    // Malformed JSON bodies (custom parser rejections) are client errors, not 500s.
    if (e.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' || e.code === 'FST_ERR_CTP_EMPTY_JSON_BODY' || /is not valid JSON|Unexpected token|Expected property name/i.test(msg)) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Malformed JSON body.' } });
    }
    const status = e.statusCode && e.statusCode < 500 ? e.statusCode : 500;
    reply.code(status).send({ error: { code: 'INTERNAL', message: status === 500 ? 'Something went wrong.' : (e.message ?? 'Error') } });
  });

  return app;
}
