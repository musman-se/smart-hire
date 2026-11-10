# Slim image: Debian base without the build toolchain. Small, and every dependency
# here ships a prebuilt wheel, so nothing needs compiling.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /code

# Dependencies first, from the lock, in a layer of their own: editing a router then
# rebuilds in seconds instead of reinstalling everything, and every build gets exactly
# the versions in requirements.lock.
COPY requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock

# Then the app itself, with no dependency resolution: the lock already installed them.
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir --no-deps .

# Migration tooling ships with the image so the schema can be brought up to date by the
# same artifact that serves traffic — no separate migration image to keep in step.
COPY alembic.ini ./
COPY migrations ./migrations

# Not root: whatever runs here — including anything an attacker gets to run through a
# bug in the API — cannot write to the image or to the source bind-mounted in dev.
RUN useradd --create-home --uid 10001 smarthire
USER smarthire

EXPOSE 8000

# Compose overrides this with --reload for development.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
