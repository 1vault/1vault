package cache

import (
	"sync"
	"strings"
	"time"

	"golang.org/x/sync/singleflight"
)

// TTL is an in-process TTL cache with singleflight and stale-while-revalidate.
type TTL struct {
	mu    sync.RWMutex
	items map[string]entry
	ttl   time.Duration
	sf    singleflight.Group
}

type entry struct {
	val   any
	exp   time.Time // fresh until
	stale time.Time // serve until (SWR)
}

func NewTTL(ttl time.Duration) *TTL {
	if ttl <= 0 {
		ttl = 30 * time.Second
	}
	c := &TTL{items: make(map[string]entry), ttl: ttl}
	go c.janitor()
	return c
}

func (c *TTL) Get(key string) (any, bool) {
	c.mu.RLock()
	e, ok := c.items[key]
	c.mu.RUnlock()
	if !ok {
		return nil, false
	}
	now := time.Now()
	if now.After(e.stale) {
		c.mu.Lock()
		delete(c.items, key)
		c.mu.Unlock()
		return nil, false
	}
	return e.val, true
}

// GetFresh returns a value only if still within the fresh TTL window.
func (c *TTL) GetFresh(key string) (any, bool) {
	c.mu.RLock()
	e, ok := c.items[key]
	c.mu.RUnlock()
	if !ok || time.Now().After(e.exp) {
		return nil, false
	}
	return e.val, true
}

func (c *TTL) Set(key string, val any) {
	c.SetTTL(key, val, c.ttl)
}

func (c *TTL) SetTTL(key string, val any, ttl time.Duration) {
	if ttl <= 0 {
		ttl = c.ttl
	}
	now := time.Now()
	c.mu.Lock()
	c.items[key] = entry{
		val:   val,
		exp:   now.Add(ttl),
		stale: now.Add(ttl * 3), // serve stale up to 3× TTL while refreshing
	}
	c.mu.Unlock()
}

func (c *TTL) GetOrSet(key string, ttl time.Duration, load func() (any, error)) (any, error) {
	if v, ok := c.GetFresh(key); ok {
		return v, nil
	}
	// Stale-while-revalidate: return stale immediately, refresh in background.
	if v, ok := c.Get(key); ok {
		go func() {
			_, _, _ = c.sf.Do(key, func() (any, error) {
				nv, err := load()
				if err != nil {
					return nil, err
				}
				c.SetTTL(key, nv, ttl)
				return nv, nil
			})
		}()
		return v, nil
	}
	v, err, _ := c.sf.Do(key, func() (any, error) {
		if hit, ok := c.GetFresh(key); ok {
			return hit, nil
		}
		nv, err := load()
		if err != nil {
			return nil, err
		}
		c.SetTTL(key, nv, ttl)
		return nv, nil
	})
	if err != nil {
		return nil, err
	}
	return v, nil
}

func (c *TTL) InvalidatePrefix(prefix string) {
	c.mu.Lock()
	for k := range c.items {
		if strings.HasPrefix(k, prefix) {
			delete(c.items, k)
		}
	}
	c.mu.Unlock()
}

func (c *TTL) janitor() {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for range t.C {
		now := time.Now()
		c.mu.Lock()
		for k, e := range c.items {
			if now.After(e.stale) {
				delete(c.items, k)
			}
		}
		c.mu.Unlock()
	}
}
