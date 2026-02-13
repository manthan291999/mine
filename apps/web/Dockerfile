FROM node:20-alpine
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN npm install
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npm", "run", "dev"]
