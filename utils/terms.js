import sanitizeHtml from 'sanitize-html';
import Terms from '../model/terms.model.js';
import { defaultTerms } from '../content/defaultTerms.js';
import AppError from '../errors/AppError.js';

export function sanitizeTerms(content) {
  return sanitizeHtml(content, {
    allowedTags: ['p', 'br', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 's', 'ol', 'ul', 'li', 'a', 'blockquote', 'span'],
    allowedAttributes: { a: ['href'], '*': ['dir', 'class'], li: ['data-list'] },
    allowedClasses: { '*': ['ql-direction-rtl', 'ql-align-right', 'ql-align-center', 'ql-align-justify', 'ql-indent-1', 'ql-indent-2', 'ql-ui'] },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'],
    allowProtocolRelative: false,
  });
}

export async function getCurrentTerms() {
  const terms = await Terms.findOne().sort({ createdAt: -1, _id: -1 }).lean();
  if (!terms) return { ...defaultTerms };
  return { title: terms.title, content: terms.content, version: terms.version, updatedAt: terms.updatedAt };
}

export async function validateTermsAcceptance(accepted, version) {
  if (accepted !== true || typeof version !== 'string' || !version) {
    throw new AppError(400, 'Terms of Use must be accepted');
  }
  const current = await getCurrentTerms();
  if (version !== current.version) {
    throw new AppError(409, 'Terms of Use have changed. Please review and accept the current version.');
  }
  return current;
}
