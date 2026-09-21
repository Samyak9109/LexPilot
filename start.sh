#!/bin/bash

# Start FastAPI in the background on port 8000
echo "Starting FastAPI on port 8000..."
cd /app/backend-fastapi
uvicorn src.backend_fastapi.main:app --host 0.0.0.0 --port 8000 &

# Wait a moment to ensure FastAPI is up
sleep 2

# Start Express in the foreground on port 7860 (configured via ENV PORT in Dockerfile)
echo "Starting Express on port 7860..."
cd /app/backend-express
npm start