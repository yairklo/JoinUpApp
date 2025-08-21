/*
  Usage (Windows cmd):
  node scripts\importFieldsFromCsv.js ..\weplay_courts_export.csv
*/
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function toFieldType(value) {
  const v = (value || '').toString().toLowerCase();
  if (v === 'open' || v === 'outdoor' || v === 'free') return 'OPEN';
  if (v === 'closed' || v === 'indoor' || v === 'paid') return 'CLOSED';
  return 'OPEN';
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('CSV path is required');
    process.exit(1);
  }
  const absPath = path.isAbsolute(csvPath) ? csvPath : path.join(process.cwd(), csvPath);
  if (!fs.existsSync(absPath)) {
    console.error('CSV file not found:', absPath);
    process.exit(1);
  }

  const content = fs.readFileSync(absPath, 'utf8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
    skip_records_with_error: true,
  });

  const alias = (row, keys) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== '') return row[k];
    }
    return undefined;
  };

  let created = 0;
  for (const row of records) {
    const name = alias(row, ['name', 'שם', 'court_name']);
    const location = alias(row, ['location', 'מיקום', 'address']) || [
      alias(row, ['city', 'עיר']),
      alias(row, ['neighborhood', 'שכונה']),
      alias(row, ['street', 'רחוב']),
      alias(row, ['street_number', 'מספר'])
    ].filter(Boolean).join(', ');
    if (!name || !location) continue;
    const description = alias(row, ['description', 'תיאור']);
    const type = toFieldType(alias(row, ['type', 'סוג', 'indoor_outdoor']));
    const priceRaw = alias(row, ['price', 'מחיר', 'hourly_rate']) || '0';
    const price = Number.parseInt(String(priceRaw).replace(/[^0-9-]/g, ''), 10);
    const image = alias(row, ['image', 'תמונה', 'image_url']) || (alias(row, ['photo_urls', 'photos']) || '').split('|')[0] || null;
    const latRaw = alias(row, ['lat', 'latitude']);
    const lngRaw = alias(row, ['lng', 'longitude']);
    const lat = latRaw ? Number(latRaw) : null;
    const lng = lngRaw ? Number(lngRaw) : null;
    const city = alias(row, ['city', 'עיר']);
    const neighborhood = alias(row, ['neighborhood', 'שכונה']);
    const street = alias(row, ['street', 'רחוב']);
    const streetNumber = alias(row, ['street_number', 'מספר']);
    const phone = alias(row, ['phone', 'טלפון']);
    const email = alias(row, ['email', 'אימייל']);
    const features = alias(row, ['features', 'מאפיינים']);
    const photoUrls = (alias(row, ['photo_urls', 'photos']) || '').split('|').filter(Boolean);

    await prisma.field.create({
      data: {
        name: String(name),
        location: String(location),
        description: description ? String(description) : null,
        type,
        price: Number.isFinite(price) ? price : 0,
        image: image ? String(image) : null,
        lat: typeof lat === 'number' && Number.isFinite(lat) ? lat : null,
        lng: typeof lng === 'number' && Number.isFinite(lng) ? lng : null,
        city: city ? String(city) : null,
        neighborhood: neighborhood ? String(neighborhood) : null,
        street: street ? String(street) : null,
        streetNumber: streetNumber ? String(streetNumber) : null,
        phone: phone ? String(phone) : null,
        email: email ? String(email) : null,
        featuresJson: features ? { raw: String(features) } : undefined,
        photos: photoUrls.length ? photoUrls : [],
      },
    });
    created++;
  }

  console.log(`Imported ${created} fields from CSV`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


