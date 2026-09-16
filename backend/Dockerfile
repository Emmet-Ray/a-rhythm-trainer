FROM python:3.12-slim-bookworm
COPY --from=ghcr.io/astral-sh/uv:0.12.15 /uv /usr/local/bin/uv
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_PYTHON_DOWNLOADS=never \
    PATH="/app/.venv/bin:$PATH"
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY . .
RUN groupadd --gid 10001 rhythm \
    && useradd --uid 10001 --gid rhythm --no-create-home rhythm \
    && mkdir -p /var/lib/rhythm-trainer \
    && chown rhythm:rhythm /var/lib/rhythm-trainer
USER rhythm
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--no-proxy-headers"]
