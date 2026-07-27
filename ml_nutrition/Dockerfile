# FuelSync ML nutrition service — container image for Railway (or any Docker host).
FROM python:3.12-slim

WORKDIR /app

# Install Python dependencies first for better layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code.
COPY . .

# Bake an evidence-based, seed-trained model into the image so the service is
# ready to serve on the first request — nobody has to train anything to use it.
# (No DATABASE_URL at build time, so this trains on the guideline seed only;
# real user data is folded in later via the /retrain endpoint.)
RUN python train_recovery_model.py

# Railway injects $PORT at runtime; default to 8000 for local `docker run`.
ENV ML_HOST=0.0.0.0
CMD ["sh", "-c", "uvicorn serve:app --host 0.0.0.0 --port ${PORT:-8000}"]
