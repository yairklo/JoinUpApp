// Exports the Terms of Use + Privacy Policy (shared/legal.js) to Markdown for legal review.
// Usage: node scripts/export-legal-md.mjs > docs/legal/joinup-legal-draft.md
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const legal = require('../shared/legal.js');
const { MIN_AGE, ADULT_AGE } = require('../shared/ageGate.js');

const out = [];
const docToMd = (doc) => {
  out.push(`# ${doc.title}`, '', `עדכון אחרון: ${legal.LEGAL_LAST_UPDATED} · גרסה ${legal.LEGAL_VERSION}`, '');
  doc.intro.forEach((p) => out.push(p, ''));
  for (const section of doc.sections) {
    out.push(`## ${section.heading}`, '');
    for (const block of section.blocks) {
      if ('ul' in block) block.ul.forEach((item) => out.push(`- ${item}`));
      else out.push(block.p);
      out.push('');
    }
  }
};

docToMd(legal.TERMS);
out.push('---', '');
docToMd(legal.PRIVACY);
out.push(
  '---',
  '',
  '# נוסחי ההסכמה במסך ההרשמה',
  '',
  `- כל משתמש (מגיל ${MIN_AGE}): "${legal.TERMS_ACCEPT_LABEL}"`,
  `- בני ${MIN_AGE}–${ADULT_AGE - 1}, בנוסף: "${legal.GUARDIAN_DECLARATION_LABEL}"`,
  ''
);

process.stdout.write(out.join('\n'));
