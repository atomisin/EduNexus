FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies with proper setup
RUN pip install --upgrade pip && \
    pip install setuptools==69.0.3 wheel && \
    pip install --no-cache-dir \
    fastapi==0.115.0 \
    uvicorn[standard]==0.32.0

# Install whisper separately to handle build issues
RUN pip install --no-cache-dir openai-whisper==20231117 || \
    pip install --no-cache-dir git+https://github.com/openai/whisper.git@v20231117

# Create models directory
RUN mkdir -p /app/models

# Download whisper model
RUN python -c "import whisper; whisper.load_model('base', download_root='/app/models')"

# Create app file
RUN printf '%s\n' \
'from fastapi import FastAPI, File, UploadFile' \
'from fastapi.responses import JSONResponse' \
'import whisper' \
'import os' \
'import tempfile' \
'' \
'app = FastAPI(title="Whisper STT Service")' \
'' \
'model = whisper.load_model("base", download_root="/app/models")' \
'' \
'@app.get("/health")' \
'async def health_check():' \
'    return {"status": "healthy", "model": "base"}' \
'' \
'@app.post("/transcribe")' \
'async def transcribe_audio(file: UploadFile = File(...)):' \
'    try:' \
'        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:' \
'            content = await file.read()' \
'            tmp.write(content)' \
'            tmp_path = tmp.name' \
'        result = model.transcribe(tmp_path)' \
'        os.unlink(tmp_path)' \
'        return {' \
'            "text": result["text"],' \
'            "language": result.get("language", "unknown"),' \
'            "segments": result.get("segments", [])' \
'        }' \
'    except Exception as e:' \
'        return JSONResponse(status_code=500, content={"error": str(e)})' \
'' \
'if __name__ == "__main__":' \
'    import uvicorn' \
'    uvicorn.run(app, host="0.0.0.0", port=8000)' > /app/main.py

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
