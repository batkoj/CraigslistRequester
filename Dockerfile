FROM node:latest
WORKDIR /usr/local/craigslistrequester

# Install app dependencies
# doing it this way before copying the actual source code we can take advantage of docker cache layer
COPY package*.json ./

RUN npm install
COPY . .
CMD [ "node", "src/server.js" ]