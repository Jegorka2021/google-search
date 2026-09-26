FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node . .
USER node
EXPOSE 3000
CMD ["npm", "start"]
