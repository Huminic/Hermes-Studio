FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl git \
    && rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/NousResearch/hermes-agent.git /app \
    && cd /app && git checkout 9ed751b96706ffd343ae26531cd0e2152a1c7036

WORKDIR /app

RUN pip install --no-cache-dir -e . aiohttp==3.13.3

EXPOSE 8642

CMD ["hermes", "gateway", "run"]
