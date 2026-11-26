FROM python:3.12-slim
WORKDIR /plugin
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
CMD ["python", "-u", "backend/main.py"]
