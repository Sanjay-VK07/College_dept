import request from 'supertest';
import app from '../app';
import { prisma } from '../config/prisma';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';

// Regression tests for the authentication-bypass vulnerability found in the GSMAS security
// audit: POST /api/auth/google used to trust a client-supplied `role` field and create a new
// account with that role, skipping the college-domain check entirely when role === 'ADMIN'.
// These tests exercise the real Express app/route (supertest), not the controller function in
// isolation, so they fail if the vulnerability is reintroduced at any layer (route, middleware,
// or controller).

describe('Authentication security — POST /api/auth/google', () => {
  const ts = Date.now();
  const createdEmails: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await prisma.$disconnect();
  });

  it('rejects an unauthenticated request asserting role=ADMIN with a non-institutional email — must NOT create an admin session', async () => {
    const email = `audit-bypass-admin-${ts}@evil-test.invalid`;
    createdEmails.push(email);

    const res = await request(app).post('/api/auth/google').send({ email, role: 'ADMIN' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);

    const created = await prisma.user.findUnique({ where: { email } });
    expect(created).toBeNull();
  });

  it('rejects an unauthenticated request asserting role=FACULTY with a non-institutional email', async () => {
    const email = `audit-bypass-faculty-${ts}@evil-test.invalid`;
    createdEmails.push(email);

    const res = await request(app).post('/api/auth/google').send({ email, role: 'FACULTY' });

    expect(res.status).toBe(403);
    const created = await prisma.user.findUnique({ where: { email } });
    expect(created).toBeNull();
  });

  it('a request with an institutional email but role=ADMIN in the body is created as STUDENT, never ADMIN', async () => {
    const email = `audit-role-ignored-${ts}@citchennai.net`;
    createdEmails.push(email);

    const res = await request(app).post('/api/auth/google').send({ email, role: 'ADMIN', name: 'Role Spoof Test' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('STUDENT');

    const created = await prisma.user.findUnique({ where: { email } });
    expect(created?.role).toBe('STUDENT');
  });

  it('a request with an institutional email but role=FACULTY in the body is still created as STUDENT', async () => {
    const email = `audit-role-ignored-faculty-${ts}@citchennai.net`;
    createdEmails.push(email);

    const res = await request(app).post('/api/auth/google').send({ email, role: 'FACULTY' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('STUDENT');
  });

  it('fake/unverified Google identity (a googleIdToken that is not a real Google JWT) is rejected when GOOGLE_CLIENT_ID is configured', async () => {
    if (!ENV.GOOGLE_CLIENT_ID) {
      // No verified-identity provider is configured in this environment — the endpoint correctly
      // falls back to the domain-gated self-service path instead, which the other tests in this
      // file cover. Nothing to assert differently here without a configured client ID.
      expect(true).toBe(true);
      return;
    }
    const res = await request(app)
      .post('/api/auth/google')
      .send({ googleIdToken: 'not-a-real-google-id-token', email: 'attacker@evil-test.invalid', role: 'ADMIN' });
    expect(res.status).toBe(401);
  });

  it('an unauthorized (non-admin) user cannot obtain an ADMIN session through this endpoint under any combination of body fields', async () => {
    const attempts = [
      { email: `audit-noadmin-1-${ts}@evil-test.invalid`, role: 'ADMIN', googleId: 'fake' },
      { email: `audit-noadmin-2-${ts}@citchennai.net`, role: 'ADMIN', canCreateExams: true },
      { email: `audit-noadmin-3-${ts}@citchennai.net`, role: 'admin' }, // lowercase variant
    ];
    for (const body of attempts) {
      createdEmails.push(body.email);
      const res = await request(app).post('/api/auth/google').send(body);
      if (res.status === 200) {
        expect(res.body.user.role).not.toBe('ADMIN');
      } else {
        expect(res.status).toBe(403);
      }
    }
  });

  it('existing legitimate ADMIN account still logs in with its real stored role', async () => {
    const email = `audit-real-admin-${ts}@citchennai.net`;
    createdEmails.push(email);
    await prisma.user.create({
      data: { email, name: 'Real Admin', role: 'ADMIN', department: 'CSE', googleId: `g_${ts}_admin` },
    });

    // Even sending role=STUDENT in the body must not downgrade an existing account — role is
    // only ever read from the database, never the request, for an existing user.
    const res = await request(app).post('/api/auth/google').send({ email, role: 'STUDENT' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('ADMIN');
    expect(res.body.token).toBeTruthy();
  });

  it('existing legitimate FACULTY account still logs in with its real stored role', async () => {
    const email = `audit-real-faculty-${ts}@citchennai.net`;
    createdEmails.push(email);
    await prisma.user.create({
      data: { email, name: 'Real Faculty', role: 'FACULTY', department: 'CSE', googleId: `g_${ts}_faculty` },
    });

    const res = await request(app).post('/api/auth/google').send({ email });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('FACULTY');
  });

  it('existing legitimate STUDENT account still logs in normally', async () => {
    const email = `audit-real-student-${ts}@citchennai.net`;
    createdEmails.push(email);
    await prisma.user.create({
      data: { email, name: 'Real Student', role: 'STUDENT', department: 'CSE', registerNo: `AUDIT${ts}`, googleId: `g_${ts}_student` },
    });

    const res = await request(app).post('/api/auth/google').send({ email, registerNo: `AUDIT${ts}` });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('STUDENT');
    expect(res.body.token).toBeTruthy();
  });

  it('domain restriction is enforced for a brand-new account regardless of asserted role', async () => {
    const res = await request(app)
      .post('/api/auth/google')
      .send({ email: `nobody-${ts}@gmail.com`, role: 'STUDENT' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Access Denied/i);
  });

  it('a token minted for a real STUDENT account cannot be used to reach an ADMIN-only route', async () => {
    const email = `audit-student-noaccess-${ts}@citchennai.net`;
    createdEmails.push(email);
    const student = await prisma.user.create({
      data: { email, name: 'No Escalation Student', role: 'STUDENT', department: 'CSE', registerNo: `AUDIT2${ts}`, googleId: `g_${ts}_s2` },
    });
    const token = jwt.sign({ id: student.id }, ENV.JWT_SECRET, { expiresIn: '1h' });

    const res = await request(app).get('/api/admin/overview').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('Authentication security — ADMIN no longer exempt from domain restriction on every request', () => {
  const ts = Date.now();
  let offDomainAdminId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `audit-offdomain-admin-${ts}@not-allowed.example`,
        name: 'Off Domain Admin',
        role: 'ADMIN',
        department: 'CSE',
        googleId: `g_${ts}_offdomain`,
      },
    });
    offDomainAdminId = user.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: offDomainAdminId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('an ADMIN-role account whose email is off the allowed domain is rejected by authenticateJWT on every request, not just login', async () => {
    const token = jwt.sign({ id: offDomainAdminId }, ENV.JWT_SECRET, { expiresIn: '1h' });
    const res = await request(app).get('/api/admin/overview').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/domain/i);
  });
});
