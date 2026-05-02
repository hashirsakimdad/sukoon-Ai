FROM python:3.11-slim
WORKDIR /app
RUN mkdir -p data/sessions
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["python", "app.py"]
