FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    espeak-ng \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir \
    fastapi==0.115.0 \
    uvicorn[standard]==0.32.0 \
    piper-tts==1.2.0 \
    soundfile==0.12.1

# Download Piper voices
RUN mkdir -p /app/voices && \
    pip install --no-cache-dir requests && \
    python -c "import requests; import os; base_url = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/'; files = ['en_US-lessac-medium.onnx', 'en_US-lessac-medium.onnx.json']; os.makedirs('/app/voices/en', exist_ok=True); [open(f'/app/voices/en/{f}', 'wb').write(requests.get(base_url + f).content) for f in files if requests.get(base_url + f).status_code == 200]"

# Create app file
RUN printf '%s\n' \
'from fastapi import FastAPI, HTTPException' \
'from pydantic import BaseModel' \
'from fastapi.responses import FileResponse' \
'import tempfile' \
'import os' \
'' \
'app = FastAPI(title="Piper TTS Service")' \
'' \
'from piper import PiperVoice' \
'' \
'voice = None' \
'try:' \
'    model_path = "/app/voices/en/en_US-lessac-medium.onnx"' \
'    config_path = "/app/voices/en/en_US-lessac-medium.onnx.json"' \
'    if os.path.exists(model_path) and os.path.exists(config_path):' \
'        voice = PiperVoice.load(model_path, config_path)' \
'        print("Voice loaded successfully")' \
'    else:' \
'        print("Voice files not found")' \
'except Exception as e:' \
'    print(f"Error loading voice: {e}")' \
'' \
'class TTSRequest(BaseModel):' \
'    text: str' \
'    voice_id: str = "en_US-lessac-medium"' \
'    speed: float = 1.0' \
'' \
'@app.get("/health")' \
'async def health_check():' \
'    return {"status": "healthy", "voice_loaded": voice is not None}' \
'' \
'@app.post("/synthesize")' \
'async def synthesize_speech(request: TTSRequest):' \
'    if voice is None:' \
'        raise HTTPException(status_code=503, detail="TTS service not ready")' \
'    try:' \
'        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:' \
'            output_path = tmp.name' \
'        with open(output_path, "wb") as f:' \
'            voice.synthesize(request.text, f)' \
'        return FileResponse(output_path, media_type="audio/wav", filename="speech.wav")' \
'    except Exception as e:' \
'        raise HTTPException(status_code=500, detail=str(e))' \
'' \
'if __name__ == "__main__":' \
'    import uvicorn' \
'    uvicorn.run(app, host="0.0.0.0", port=8000)' > /app/main.py

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
