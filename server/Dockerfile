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

# 10. הרצת מיגרציות Prisma לפני עליית השרת, ואז הרצת השרת עצמו
CMD npx prisma migrate deploy && npm start