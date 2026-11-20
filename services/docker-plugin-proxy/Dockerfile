FROM node:24-alpine
WORKDIR /app
COPY policy.mjs server.mjs ./
USER 1001
EXPOSE 2375
CMD ["node", "server.mjs"]
