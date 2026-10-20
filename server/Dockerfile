# Coolify (dev and prod): set the application base directory to /server, the
# exposed port to 3005, and the health check to GET /api/health.
# Leave the start command empty so this image's CMD runs. `npm start`
# (scripts/render-start.js) applies Prisma migrations and then listens.
# Do not point the health check at /api/health/deep — that query keeps Neon awake.
# 1. השתמש באימג' רשמי וקל משקל של Node.js
FROM node:20-alpine

# 2. התקנת תלויות מערכת ש-Prisma צריכה בשביל לרוץ על Alpine (כמו openssl)
RUN apk add --no-cache openssl

RUN apk add --no-cache curl

# 3. הגדרת תיקיית העבודה בקונטיינר
WORKDIR /app

# 4. העתקת קבצי החבילה קודם כל (לניצול Cache של Docker)
COPY package*.json ./

# 5. התקנת התלויות (כולל devDependencies כדי שנוכל להשתמש ב-CLI של Prisma בבנייה)
RUN npm install

# 6. העתקת תיקיית ה-prisma (שם נמצא ה-schema.prisma)
COPY prisma ./prisma/

# 7. הרצת ה-generate של Prisma כדי לייצר את ה-Client המעודכן
RUN npx prisma generate

# 8. העתקת שאר קוד המקור של ה-Backend לקונטיינר
COPY . .

# 9. חשיפת הפורט שבו השרת משתמש (פורט 3005)
EXPOSE 3005

# 10. Migrations then listen. npm start is scripts/render-start.js, which runs
# `prisma migrate deploy` and refuses to boot if it fails (same as production).
# PORT defaults to 3005; Coolify may inject PORT — the health check follows it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD sh -c 'curl -fsS "http://127.0.0.1:${PORT:-3005}/api/health" || exit 1'

CMD ["npm", "start"]