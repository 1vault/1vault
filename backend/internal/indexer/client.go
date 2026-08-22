package indexer

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

var ErrDisabled = errors.New("indexer ingest URL not configured")

type ComponentHealth struct {
	OK         bool   `json:"ok"`
	LastSeenAt string `json:"lastSeenAt,omitempty"`
	AgeMs      *int64 `json:"ageMs,omitempty"`
}

type HealthStatus struct {
	Configured bool            `json:"configured"`
	OK         bool            `json:"ok"`
	API        string          `json:"api"` // up|down|disabled
	Dev        string          `json:"dev"` // up|down|disabled — npm run dev poller
	Components map[string]any  `json:"components,omitempty"`
}

type IngestResult struct {
	OK        bool   `json:"ok"`
	Signature string `json:"signature"`
	Events    int    `json:"events"`
	Error     string `json:"error,omitempty"`
}

type Client struct {
	ingestURL string
	baseURL   string
	http      *http.Client
	retries   int
}

func New(ingestURL string) *Client {
	ingestURL = strings.TrimSpace(ingestURL)
	base := strings.TrimSuffix(ingestURL, "/api/ingest")
	if base == ingestURL {
		base = strings.TrimRight(ingestURL, "/")
	}
	return &Client{
		ingestURL: ingestURL,
		baseURL:   base,
		http:      &http.Client{Timeout: 30 * time.Second},
		retries:   3,
	}
}

func (c *Client) Enabled() bool {
	return c != nil && c.ingestURL != ""
}

func (c *Client) Ingest(ctx context.Context, signature string) (IngestResult, error) {
	if !c.Enabled() {
		return IngestResult{}, ErrDisabled
	}
	body, _ := json.Marshal(map[string]string{"signature": signature})
	var lastErr error
	for attempt := 0; attempt < c.retries; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(attempt*200) * time.Millisecond)
		}
		res, err := c.post(ctx, c.ingestURL, body)
		if err != nil {
			lastErr = err
			continue
		}
		var out IngestResult
		if m, ok := res.(map[string]any); ok {
			out.OK = m["ok"] == true
			out.Signature = signature
			if ev, ok := m["events"].(float64); ok {
				out.Events = int(ev)
			}
		} else {
			out.OK = true
			out.Signature = signature
		}
		return out, nil
	}
	return IngestResult{OK: false, Signature: signature, Error: lastErr.Error()}, lastErr
}

func (c *Client) Health(ctx context.Context) error {
	_, err := c.Status(ctx)
	if err != nil {
		return err
	}
	return nil
}

// Status probes indexer REST /health and reports api + dev (poller) components.
func (c *Client) Status(ctx context.Context) (HealthStatus, error) {
	if !c.Enabled() {
		return HealthStatus{Configured: false, OK: false, API: "disabled", Dev: "disabled"}, ErrDisabled
	}
	url := c.baseURL + "/health"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return HealthStatus{Configured: true, OK: false, API: "down", Dev: "unknown"}, err
	}
	res, err := c.http.Do(req)
	if err != nil {
		return HealthStatus{Configured: true, OK: false, API: "down", Dev: "unknown"}, err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 300 {
		return HealthStatus{Configured: true, OK: false, API: "down", Dev: "unknown"},
			fmt.Errorf("indexer health %d", res.StatusCode)
	}
	var body map[string]any
	if json.Unmarshal(raw, &body) != nil {
		return HealthStatus{Configured: true, OK: true, API: "up", Dev: "unknown"}, nil
	}
	out := HealthStatus{Configured: true, API: "up", Dev: "down"}
	if comps, ok := body["components"].(map[string]any); ok {
		out.Components = comps
		if dev, ok := comps["dev"].(map[string]any); ok {
			if dev["ok"] == true {
				out.Dev = "up"
			}
			if last, ok := dev["lastSeenAt"].(string); ok {
				out.Components["devLastSeenAt"] = last
			}
		} else if comps["poller"] != nil {
			// backward compat
			if poller, ok := comps["poller"].(map[string]any); ok && poller["ok"] == true {
				out.Dev = "up"
			}
		}
	}
	out.OK = out.API == "up" && out.Dev == "up"
	return out, nil
}

func (c *Client) post(ctx context.Context, url string, body []byte) (any, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	var data any
	if json.Unmarshal(raw, &data) != nil {
		data = string(raw)
	}
	if res.StatusCode >= 300 {
		return data, fmt.Errorf("ingest failed: %d", res.StatusCode)
	}
	return data, nil
}
