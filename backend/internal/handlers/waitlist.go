package handlers

import (
	"net/http"
	"time"

	"github.com/1vault/backend/internal/cluster"
	"github.com/1vault/backend/internal/httpx"
)

func (a *API) JoinWaitlist(w http.ResponseWriter, r *http.Request) {
	c := cluster.Cluster(a.Cfg.DefaultCluster)
	r = httpx.WithValue(r, httpx.KeyCluster, c)
	userID := httpx.UserID(r)

	var twitterID, handle string
	err := a.Pool.QueryRow(r.Context(), `
		SELECT twitter_id, handle FROM users WHERE id = $1::uuid`, userID,
	).Scan(&twitterID, &handle)
	if err != nil {
		httpx.Fail(w, r, http.StatusNotFound, "USER_NOT_FOUND", "User not found", nil)
		return
	}

	var joinedAt time.Time
	tag, err := a.Pool.Exec(r.Context(), `
		INSERT INTO waitlist (user_id, twitter_id, handle)
		VALUES ($1::uuid, $2, $3)
		ON CONFLICT (user_id) DO NOTHING`,
		userID, twitterID, handle,
	)
	if err != nil {
		httpx.WriteErr(w, r, err)
		return
	}

	status := "joined"
	if tag.RowsAffected() == 0 {
		status = "existing"
		err = a.Pool.QueryRow(r.Context(), `
			SELECT joined_at FROM waitlist WHERE user_id = $1::uuid`, userID,
		).Scan(&joinedAt)
	} else {
		err = a.Pool.QueryRow(r.Context(), `
			SELECT joined_at FROM waitlist WHERE user_id = $1::uuid`, userID,
		).Scan(&joinedAt)
	}
	if err != nil {
		httpx.WriteErr(w, r, err)
		return
	}

	var position int
	err = a.Pool.QueryRow(r.Context(), `
		SELECT COUNT(*)::int FROM waitlist WHERE joined_at <= $1`, joinedAt,
	).Scan(&position)
	if err != nil {
		httpx.WriteErr(w, r, err)
		return
	}

	code := http.StatusCreated
	if status == "existing" {
		code = http.StatusOK
	}
	httpx.OK(w, r, map[string]any{
		"status":   status,
		"handle":   handle,
		"position": position,
		"joinedAt": joinedAt,
	}, code)
}

func (a *API) WaitlistMe(w http.ResponseWriter, r *http.Request) {
	c := cluster.Cluster(a.Cfg.DefaultCluster)
	r = httpx.WithValue(r, httpx.KeyCluster, c)
	userID := httpx.UserID(r)

	var handle string
	var joinedAt time.Time
	err := a.Pool.QueryRow(r.Context(), `
		SELECT handle, joined_at FROM waitlist WHERE user_id = $1::uuid`, userID,
	).Scan(&handle, &joinedAt)
	if err != nil {
		httpx.OK(w, r, map[string]any{"joined": false}, http.StatusOK)
		return
	}

	var position int
	_ = a.Pool.QueryRow(r.Context(), `
		SELECT COUNT(*)::int FROM waitlist WHERE joined_at <= $1`, joinedAt,
	).Scan(&position)

	httpx.OK(w, r, map[string]any{
		"joined":   true,
		"handle":   handle,
		"position": position,
		"joinedAt": joinedAt,
	}, http.StatusOK)
}
