# Slim image: Debian base without the build toolchain. Small, and every dependency
# here ships a prebuilt wheel, so nothing needs compiling.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /code

# Dependencies are installed before the source is copied so that Docker can cache this
# layer. Editing a router then rebuilds in seconds instead of reinstalling everything.
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .

# Migration tooling ships with the image so the schema can be brought up to date by the
# same artifact that serves traffic — no separate migration image to keep in step.
COPY alembic.ini ./
COPY migrations ./migrations

EXPOSE 8000

# Compose overrides this with --reload for development.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
