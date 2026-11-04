# Hack the Brewery (Exclusive Networks) - CTFd 3.7.7 + workshop features
#
# Compile the student theme (JavaScript + SCSS) so the image always ships
# assets that match the sources in CTFd/themes/core-beta/assets.
FROM node:20-bookworm-slim AS theme

WORKDIR /theme
COPY CTFd/themes/core-beta/package.json CTFd/themes/core-beta/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY CTFd/themes/core-beta/ ./
RUN npm run build


# Compile the admin theme too, so the Exclusive Networks colours in
# CTFd/themes/admin/assets/css/main.scss reach the admin panel.
FROM node:20-bookworm-slim AS admintheme

WORKDIR /admin
COPY CTFd/themes/admin/package.json CTFd/themes/admin/yarn.lock ./
RUN yarn install --frozen-lockfile --non-interactive --network-timeout 600000
COPY CTFd/themes/admin/ ./
RUN yarn build


FROM python:3.11-slim-bookworm AS build

WORKDIR /opt/CTFd

# hadolint ignore=DL3008
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libffi-dev \
        libssl-dev \
        git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && python -m venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH"

COPY . /opt/CTFd

RUN pip install --no-cache-dir -r requirements.txt \
    && for d in CTFd/plugins/*; do \
        if [ -f "$d/requirements.txt" ]; then \
            pip install --no-cache-dir -r "$d/requirements.txt";\
        fi; \
    done;


FROM python:3.11-slim-bookworm AS release
WORKDIR /opt/CTFd

# hadolint ignore=DL3008
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libffi8 \
        libssl3 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY --chown=1001:1001 . /opt/CTFd
COPY --chown=1001:1001 --from=theme /theme/static /opt/CTFd/CTFd/themes/core-beta/static
COPY --chown=1001:1001 --from=admintheme /admin/static /opt/CTFd/CTFd/themes/admin/static

RUN useradd \
    --no-log-init \
    --shell /bin/bash \
    -u 1001 \
    ctfd \
    && mkdir -p /var/log/CTFd /var/uploads \
    && chown -R 1001:1001 /var/log/CTFd /var/uploads /opt/CTFd \
    && chmod +x /opt/CTFd/docker-entrypoint.sh

COPY --chown=1001:1001 --from=build /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

USER 1001
EXPOSE 8000
ENTRYPOINT ["/opt/CTFd/docker-entrypoint.sh"]
