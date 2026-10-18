// Exports the Terms of Use + Privacy Policy (shared/legal.js), Hebrew and English, to Markdown.
// Usage: node scripts/export-legal-md.mjs > docs/legal/joinup-legal.md
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const legal = require('../shared/legal.js');
const { MIN_AGE, ADULT_AGE } = require('../shared/ageGate.js');

const out = [];
const docToMd = (doc, texts) => {
  out.push(`## ${doc.title}`, '', `${texts.lastUpdatedLabel}: ${texts.lastUpdated} · ${legal.LEGAL_VERSION}`, '');
  doc.intro.forEach((p) => out.push(p, ''));
  for (const section of doc.sections) {
    out.push(`### ${section.heading}`, '');
    for (const block of section.blocks) {
      if ('ul' in block) block.ul.forEach((item) => out.push(`- ${item}`));
      else out.push(block.p);
      out.push('');
    }
  }
};

for (const lang of ['he', 'en']) {
  const texts = legal.getLegalTexts(lang);
  const en = lang === 'en';
  out.push(`# ${en ? 'JoinUp — English' : 'JoinUp — עברית'}`, '');
  docToMd(texts.terms, texts);
  docToMd(texts.privacy, texts);
  out.push(
    `## ${en ? 'Registration consent texts' : 'נוסחי ההסכמה במסך ההרשמה'}`,
    '',
    `- ${en ? `All users (ages ${MIN_AGE}+)` : `כל משתמש (מגיל ${MIN_AGE})`}: ${texts.termsAcceptLabel}`,
    `- ${en ? `Ages ${MIN_AGE}–${ADULT_AGE - 1} (additional)` : `בני ${MIN_AGE}–${ADULT_AGE - 1} (בנוסף)`}: ${texts.guardianDeclarationLabel}`,
    '',
    '---',
    ''
  );
}

process.stdout.write(out.join('\n'));
