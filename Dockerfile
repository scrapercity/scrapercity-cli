FROM node:20-slim
RUN npm install -g scrapercity
ENV SCRAPERCITY_API_KEY=""
ENTRYPOINT ["scrapercity-mcp"]
