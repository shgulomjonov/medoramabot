# 1. Yengil Node.js versiyasini olamiz
FROM node:20-alpine

# 2. Ishchi papkani belgilaymiz
WORKDIR /app

# 3. Paketlar ro'yxatini ko'chirib o'tamiz
COPY package*.json ./

# 4. Kutubxonalarni o'rnatamiz (faqat production uchun)
RUN npm install --production

# 5. Barcha kodni ko'chirib o'tamiz
COPY . .

# 6. Botni ishga tushiramiz
CMD ["node", "index.js"]