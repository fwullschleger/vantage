# Stage 1: Build the frontend
FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Python runtime
FROM python:3.13-slim
WORKDIR /app

# Install git (needed by GitPython) and uv
RUN apt-get update && \
    apt-get install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists/* && \
    pip install --no-cache-dir uv

# Install Python dependencies
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Copy application code
COPY . .

# Copy built frontend into the expected location
COPY --from=frontend /app/frontend/dist ./src/vantage/frontend_dist

# Pre-create mount targets
RUN mkdir -p /docs /repos /config

# Entrypoint wrapper to pass args through to vantage CLI
RUN printf '#!/bin/sh\nexec uv run vantage "$@"\n' > /usr/local/bin/entrypoint.sh && \
    chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["serve", "--host", "0.0.0.0", "/docs"]
