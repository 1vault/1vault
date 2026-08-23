# Build static Go binary for Railway / any linux container.
# Root directory for Railway service = backend/

FROM golang:1.26-bookworm AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /out/1vault-api \
    ./cmd/api

# Slim Debian (not distroless) so CA certs exist for Supabase TLS verify.
FROM debian:bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /out/1vault-api /app/1vault-api
COPY migrations /app/migrations
COPY docs/openapi.yaml /app/docs/openapi.yaml
COPY docs/idl.json /app/docs/idl.json

ENV PORT=8080
EXPOSE 8080

USER nobody
CMD ["/app/1vault-api"]
