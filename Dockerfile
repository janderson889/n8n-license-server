# Use a lightweight Alpine-based Node.js image
FROM node:22-alpine

RUN apk add openssl

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (if exists) to the working directory
# This allows caching of npm install if these files don't change
COPY package*.json ./

# Install application dependencies
# Using --production flag to only install production dependencies
RUN npm install --production

# Copy the rest of the application code
COPY --chown=node:node . .

# Expose the port the Express app will listen on
EXPOSE 3000

# Build certs
RUN openssl genrsa -out private_key.pem 2048
RUN openssl req -new -x509 -key private_key.pem -out certificate.pem -days 42069 -subj "/CN=example.com/O=MyOrg"
RUN chown node:node private_key.pem certificate.pem

USER node
# Command to run the application
# Use 'npm start' if you have a start script in package.json, otherwise 'node app.js'
CMD ["node", "licenseServer.js"]