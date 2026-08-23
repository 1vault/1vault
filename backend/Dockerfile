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

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app

COPY --from=build /out/1vault-api /app/1vault-api
COPY migrations /app/migrations
COPY docs/openapi.yaml /app/docs/openapi.yaml
COPY docs/idl.json /app/docs/idl.json

ENV PORT=8080
EXPOSE 8080

USER nonroot:nonroot
CMD ["/app/1vault-api"]
