package httpx

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/1vault/backend/internal/cluster"
	"github.com/1vault/backend/internal/roles"
	"github.com/google/uuid"
)

type ctxKey string

const (
	KeyRequestID ctxKey = "requestId"
	KeyCluster   ctxKey = "cluster"
	KeyUserID    ctxKey = "userId"
	KeyTwitterID ctxKey = "twitterId"
)

type Meta struct {
	Cluster   *cluster.Cluster `json:"cluster"`
	RequestID string           `json:"requestId"`
	Version   string           `json:"version"`
}

type ErrorBody struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

type Envelope struct {
	Success bool       `json:"success"`
	Data    any        `json:"data"`
	Meta    Meta       `json:"meta"`
	Error   *ErrorBody `json:"error"`
}

func RequestID(r *http.Request) string {
	if v, ok := r.Context().Value(KeyRequestID).(string); ok && v != "" {
		return v
	}
	return uuid.NewString()
}

func ClusterFrom(r *http.Request) cluster.Cluster {
	if v, ok := r.Context().Value(KeyCluster).(cluster.Cluster); ok {
		return v
	}
	return cluster.Devnet
}

func UserID(r *http.Request) string {
	v, _ := r.Context().Value(KeyUserID).(string)
	return v
}

func WithValue(r *http.Request, key ctxKey, val any) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), key, val))
}

func meta(r *http.Request) Meta {
	c := ClusterFrom(r)
	return Meta{Cluster: &c, RequestID: RequestID(r), Version: "v1"}
}

func OK(w http.ResponseWriter, r *http.Request, data any, status int) {
	write(w, status, Envelope{Success: true, Data: roles.RewritePublic(data), Meta: meta(r), Error: nil})
}

func Fail(w http.ResponseWriter, r *http.Request, status int, code, message string, details map[string]any) {
	var det map[string]any
	if details != nil {
		if rewritten, ok := roles.RewritePublic(details).(map[string]any); ok {
			det = rewritten
		} else {
			det = details
		}
	}
	write(w, status, Envelope{
		Success: false,
		Data:    nil,
		Meta:    meta(r),
		Error:   &ErrorBody{Code: code, Message: message, Details: det},
	})
}

func write(w http.ResponseWriter, status int, body Envelope) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

type APIError struct {
	Status  int
	Code    string
	Message string
	Details map[string]any
}

func (e *APIError) Error() string { return e.Message }

func WriteErr(w http.ResponseWriter, r *http.Request, err error) {
	if ae, ok := err.(*APIError); ok {
		Fail(w, r, ae.Status, ae.Code, ae.Message, ae.Details)
		return
	}
	Fail(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "Internal server error", nil)
}
