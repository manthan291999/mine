FROM node:20-alpine
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/realtime ./apps/realtime
RUN npm install
WORKDIR /app/apps/realtime
EXPOSE 4001
CMD ["npm", "run", "dev"]
