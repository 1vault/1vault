package dex

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024 * 64,
	WriteBufferSize: 1024 * 64,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// IsWebSocketUpgrade reports whether the request is a WebSocket handshake.
func IsWebSocketUpgrade(r *http.Request) bool {
	return websocket.IsWebSocketUpgrade(r)
}

// ProxyWebSocket upgrades the client connection and relays frames to/from upstream.
// Frames that look like discovery payloads are filtered to Solana-only.
func (c *Client) ProxyWebSocket(w http.ResponseWriter, r *http.Request, upstreamPath string) error {
	clientConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return err
	}
	defer clientConn.Close()

	u, err := url.Parse(c.WSURL + upstreamPath)
	if err != nil {
		_ = clientConn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "bad upstream"))
		return err
	}
	dialer := websocket.Dialer{
		HandshakeTimeout: 15 * time.Second,
	}
	header := http.Header{}
	header.Set("User-Agent", UserAgent)
	upConn, _, err := dialer.Dial(u.String(), header)
	if err != nil {
		_ = clientConn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseTryAgainLater, "upstream unavailable"))
		return err
	}
	defer upConn.Close()

	errc := make(chan error, 2)
	go pipeWS(clientConn, upConn, errc, false) // client → upstream: pass through
	go pipeWS(upConn, clientConn, errc, true)  // upstream → client: filter Solana
	<-errc
	return nil
}

func pipeWS(dst, src *websocket.Conn, errc chan<- error, filterSolana bool) {
	for {
		mt, msg, err := src.ReadMessage()
		if err != nil {
			errc <- err
			return
		}
		if filterSolana && mt == websocket.TextMessage {
			msg = filterWSPayload(msg)
			if len(msg) == 0 {
				continue
			}
		}
		if err := dst.WriteMessage(mt, msg); err != nil {
			errc <- err
			return
		}
	}
}

// filterWSPayload keeps Solana items in handshake / update JSON payloads.
func filterWSPayload(raw []byte) []byte {
	raw = bytesTrimSpace(raw)
	if len(raw) == 0 {
		return raw
	}
	// Handshake shape: {"limit":N,"data":[...]}
	var envelope map[string]any
	if err := json.Unmarshal(raw, &envelope); err == nil {
		if data, ok := envelope["data"]; ok {
			b, _ := json.Marshal(data)
			items := FilterByChain(ParseObjectList(b), DefaultChain)
			items = sanitizeStreamItems(items)
			envelope["data"] = items
			envelope["count"] = len(items)
			envelope["chainId"] = DefaultChain
			out, err := json.Marshal(envelope)
			if err != nil {
				return raw
			}
			return out
		}
	}
	// Bare list
	items := FilterByChain(ParseObjectList(raw), DefaultChain)
	if len(items) > 0 || looksLikeObjectList(raw) {
		items = sanitizeStreamItems(items)
		out, err := json.Marshal(items)
		if err != nil {
			return raw
		}
		return out
	}
	return raw
}

func sanitizeStreamItems(items []map[string]any) []map[string]any {
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		cp := make(map[string]any, len(item)+1)
		for k, v := range item {
			if k == "url" {
				cp["chartUrl"] = v
				continue
			}
			cp[k] = v
		}
		out = append(out, cp)
	}
	return out
}

func looksLikeObjectList(raw []byte) bool {
	s := strings.TrimSpace(string(raw))
	return strings.HasPrefix(s, "[")
}

func bytesTrimSpace(b []byte) []byte {
	return bytes.TrimSpace(b)
}
