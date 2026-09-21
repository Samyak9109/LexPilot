FROM python:3.12-slim

# Install Node.js
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Set up a non-root user required by Hugging Face Spaces
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH"

WORKDIR /app

# Copy FastAPI requirements and install
COPY --chown=user:user backend-fastapi/requirements.txt ./backend-fastapi/
RUN pip install --no-cache-dir -r backend-fastapi/requirements.txt

# Copy Express requirements and install
COPY --chown=user:user backend-express/package*.json ./backend-express/
RUN cd backend-express && npm install

# Copy all source code
COPY --chown=user:user . .

# Expose port 7860 (Hugging Face Spaces default)
EXPOSE 7860

# Environment variables
ENV PORT=7860
ENV FASTAPI_URL=http://localhost:8000
# In Hugging Face Spaces, secrets are set in the Space settings
# MONGODB_URI and GEMINI_API_KEY must be set there.

# Make start script executable
RUN chmod +x /app/start.sh

CMD ["/app/start.sh"]
