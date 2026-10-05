import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import Terms from '../model/terms.model.js';
import User from '../model/user.model.js';
import termsRouter from '../route/terms.route.js';
import { defaultTerms } from '../content/defaultTerms.js';
import { sanitizeTerms, validateTermsAcceptance } from '../utils/terms.js';
import { createTrip } from '../controller/trip.controller.js';

test('Terms HTML keeps formatting and removes executable content', () => {
  const clean = sanitizeTerms('<h2 dir="rtl">Title</h2><script>alert(1)</script><p onclick="evil()"><strong>Text</strong><a href="javascript:evil()">link</a><img src=x onerror=evil()></p><ol><li data-list="bullet">Item</li></ol>');
  assert.ok(clean.includes('<h2 dir="rtl">Title</h2>'));
  assert.ok(clean.includes('<strong>Text</strong>'));
  assert.ok(clean.includes('data-list="bullet"'));
  assert.doesNotMatch(clean, /script|onclick|javascript|onerror|<img/);
  assert.equal((defaultTerms.content.match(/<h2>/g) || []).length, 14);
});

test('public content, admin publishing and booking acceptance enforce versions and access', async () => {
  const original = { find: Terms.findOne, create: Terms.create, user: User.findById, secret: process.env.JWT_ACCESS_SECRET };
  let current = null;
  let publicationCount = 0;
  Terms.findOne = () => ({ sort: () => ({ lean: async () => current }) });
  Terms.create = async (data) => { publicationCount++; current = { ...data, updatedAt: new Date() }; return current; };
  process.env.JWT_ACCESS_SECRET = 'terms-test-secret';
  let user = { _id: '507f1f77bcf86cd799439011', role: 'admin', adminPermissions: [], authVersion: 0 };
  User.findById = async () => user;
  const token = jwt.sign({ _id: user._id }, process.env.JWT_ACCESS_SECRET);
  const app = express();
  app.use(express.json());
  app.use('/terms', termsRouter);
  app.post('/trips', (req, _res, next) => { req.user = { name: 'Customer', phoneNumber: '+972501234567' }; next(); }, createTrip);
  app.use((err, _req, res, _next) => res.status(err.statusCode || 500).json({ message: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const publish = (auth = token, body = { title: 'Terms', content: '<p>New terms</p><script>evil()</script>' }) => fetch(`${base}/terms`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(body),
  });
  try {
    const publicResponse = await fetch(`${base}/terms`);
    assert.equal(publicResponse.status, 200);
    assert.equal(publicResponse.headers.get('cache-control'), 'no-store');
    assert.equal((await publicResponse.json()).data.version, defaultTerms.version);
    assert.equal((await publish(null)).status, 401);
    assert.equal((await publish()).status, 403);
    user.adminPermissions = ['settings'];
    user.mustChangePin = true;
    assert.equal((await publish()).status, 403);
    user.mustChangePin = false;
    assert.equal((await publish(token, { title: 'Terms', content: '<p><br></p>' })).status, 400);
    const published = await publish();
    assert.equal(published.status, 200);
    const data = (await published.json()).data;
    assert.notEqual(data.version, defaultTerms.version);
    assert.equal(data.content, '<p>New terms</p>');
    assert.equal(data.updatedBy, undefined);
    assert.equal(publicationCount, 1);
    await assert.rejects(validateTermsAcceptance(false, data.version), { statusCode: 400 });
    await assert.rejects(validateTermsAcceptance(true, undefined), { statusCode: 400 });
    await assert.rejects(validateTermsAcceptance(true, defaultTerms.version), { statusCode: 409 });
    assert.equal((await validateTermsAcceptance(true, data.version)).version, data.version);
    // Reject direct API bookings even when bookingSource is omitted or says app.
    for (const bookingSource of [undefined, 'website', 'app']) {
      const response = await fetch(`${base}/trips`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pickupAddress: 'A', dropoffAddress: 'B', bookingSource }) });
      assert.equal(response.status, 400);
      assert.match((await response.json()).message, /Terms of Use/);
    }
    const read = (await (await fetch(`${base}/terms`)).json()).data;
    assert.equal(read.version, data.version);
  } finally {
    await new Promise(resolve => server.close(resolve));
    Terms.findOne = original.find;
    Terms.create = original.create;
    User.findById = original.user;
    if (original.secret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = original.secret;
  }
});
