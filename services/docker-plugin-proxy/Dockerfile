FROM node:24-alpine
WORKDIR /app
COPY policy.mjs server.mjs ./
# Start as root so server.mjs can join the docker socket's group, then drop to
# uid 1001. Do not change the socket mode.
CMD ["node", "server.mjs"]
