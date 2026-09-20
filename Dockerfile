FROM python:3.12-slim

WORKDIR /app
COPY apps/backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY apps/backend /app/apps/backend
COPY data/demo /app/data/demo

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--app-dir", "apps/backend", "--host", "0.0.0.0", "--port", "8000"]
