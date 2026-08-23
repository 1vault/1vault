package db

import (
	"strings"
	"testing"
)

func TestNormalizeDatabaseURL_SupabaseSessionToTransaction(t *testing.T) {
	in := "postgresql://postgres.abc:secret@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres"
	out := normalizeDatabaseURL(in)
	if !strings.Contains(out, ":6543/") && !strings.Contains(out, ":6543?") {
		t.Fatalf("expected port 6543, got %s", out)
	}
	if !strings.Contains(out, "sslmode=require") {
		t.Fatalf("expected sslmode=require, got %s", out)
	}
	if strings.Contains(out, ":5432") {
		t.Fatalf("session port should be rewritten: %s", out)
	}
}

func TestNormalizeDatabaseURL_AlreadyTransaction(t *testing.T) {
	in := "postgresql://postgres.abc:secret@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?sslmode=require"
	out := normalizeDatabaseURL(in)
	if !strings.Contains(out, ":6543") {
		t.Fatalf("kept 6543, got %s", out)
	}
}

func TestTLSServerName(t *testing.T) {
	if got := tlsServerName("aws-0-ap-southeast-2.pooler.supabase.com:5432"); got != "aws-0-ap-southeast-2.pooler.supabase.com" {
		t.Fatalf("got %q", got)
	}
}

func TestNeedsTLS(t *testing.T) {
	if !needsTLS("postgresql://x@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres", "aws-0-ap-southeast-2.pooler.supabase.com") {
		t.Fatal("supabase should need TLS")
	}
	if needsTLS("postgresql://x@localhost/onevault?sslmode=disable", "localhost") {
		t.Fatal("sslmode=disable should skip TLS")
	}
}
