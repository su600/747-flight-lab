FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY . .

# The checked-in runtime already uses /747/ URLs. Rewriting them again would
# double the prefix and break model loading in a rebuilt image.
RUN node --check server.mjs && npm run check && npm run check:liveries && npm run check:camera

EXPOSE 8748
CMD ["node", "server.mjs"]
