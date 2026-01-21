FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app

# Copy CSV data files into the image so the simulator and API
# can read `Consumption.csv` and `Paths.csv` in both local and Docker.
COPY Consumption.csv Paths.csv ./

# Copy built frontend assets. The Docker build context must include
# the repository root (e.g. `context: .` in docker-compose) so that
# `frontend_dist/` is visible.
COPY frontend_dist ./frontend_dist

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
