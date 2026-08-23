package db

import "testing"

func TestTLSServerName(t *testing.T) {
	cases := map[string]string{
		"aws-0-ap-southeast-2.pooler.supabase.com":      "aws-0-ap-southeast-2.pooler.supabase.com",
		"aws-0-ap-southeast-2.pooler.supabase.com:5432": "aws-0-ap-southeast-2.pooler.supabase.com",
		" db.xxx.supabase.co ":                         "db.xxx.supabase.co",
	}
	for in, want := range cases {
		if got := tlsServerName(in); got != want {
			t.Fatalf("tlsServerName(%q)=%q want %q", in, got, want)
		}
	}
}

func TestNeedsTLS(t *testing.T) {
	if !needsTLS("postgresql://x@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres", "aws-0-ap-southeast-2.pooler.supabase.com") {
		t.Fatal("supabase host should need TLS")
	}
	if needsTLS("postgresql://x@localhost:5432/onevault?sslmode=disable", "localhost") {
		t.Fatal("sslmode=disable should skip TLS")
	}
	if !needsTLS("postgresql://x@db.example.com/postgres?sslmode=require", "db.example.com") {
		t.Fatal("sslmode=require should need TLS")
	}
}
