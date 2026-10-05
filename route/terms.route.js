import express from 'express';
import { randomUUID } from 'node:crypto';
import Terms from '../model/terms.model.js';
import { getCurrentTerms, sanitizeTerms } from '../utils/terms.js';
import { protect, isAdmin, requireAdminPermission } from '../middleware/auth.middleware.js';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../errors/AppError.js';

const router = express.Router();
router.get('/', catchAsync(async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: await getCurrentTerms() });
}));
router.put('/', protect, isAdmin, requireAdminPermission('settings'), catchAsync(async (req, res) => {
  const { title, content } = req.body;
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 200 ||
      typeof content !== 'string' || content.length > 200000) {
    throw new AppError(400, 'A title and Terms content are required (maximum 200,000 characters).');
  }
  const clean = sanitizeTerms(content);
  if (!sanitizeTerms(clean).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()) {
    throw new AppError(400, 'Terms content cannot be empty.');
  }
  const terms = await Terms.create({ title: title.trim(), content: clean, version: randomUUID(), updatedBy: req.user._id });
  res.json({ success: true, data: { title: terms.title, content: terms.content, version: terms.version, updatedAt: terms.updatedAt } });
}));
export default router;
