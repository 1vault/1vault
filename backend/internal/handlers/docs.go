package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"gopkg.in/yaml.v3"
)

func openAPIPath() string {
	for _, root := range candidateRoots() {
		p := filepath.Join(root, "docs", "openapi.yaml")
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
	}
	return "docs/openapi.yaml"
}

func candidateRoots() []string {
	var roots []string
	if wd, err := os.Getwd(); err == nil {
		roots = append(roots, wd, filepath.Dir(wd))
	}
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		roots = append(roots, exeDir, filepath.Dir(exeDir))
	}
	if _, file, _, ok := runtime.Caller(0); ok {
		roots = append(roots, filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..")))
	}
	seen := map[string]struct{}{}
	var out []string
	for _, r := range roots {
		r = filepath.Clean(r)
		if _, ok := seen[r]; ok {
			continue
		}
		seen[r] = struct{}{}
		out = append(out, r)
	}
	return out
}

func (a *API) OpenAPI(w http.ResponseWriter, r *http.Request) {
	b, err := os.ReadFile(openAPIPath())
	if err != nil {
		http.Error(w, "openapi missing", http.StatusInternalServerError)
		return
	}
	var doc any
	if err := yaml.Unmarshal(b, &doc); err != nil {
		http.Error(w, "openapi invalid", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(doc)
}

func (a *API) DocsIndex(w http.ResponseWriter, r *http.Request) {
	html := `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>1Vault API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; overflow-y: scroll; }
    body { margin: 0; background: #fafafa; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info .title { font-size: 1.75rem; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    const tagOrder = [
      'System','Auth','Wallets','Protocol','Vaults','Actors',
      'Token · Market','Token · Research','Flows',
      'Tx · Setup','Tx · Capital','Tx · Follow','Tx · Trade','Tx · Fees','Tx · Close','Tx · Submit',
      'Ledger','Features'
    ];
    window.ui = SwaggerUIBundle({
      url: '/v1/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      tryItOutEnabled: true,
      displayRequestDuration: true,
      tagsSorter: (a, b) => {
        const ia = tagOrder.indexOf(a);
        const ib = tagOrder.indexOf(b);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      },
      operationsSorter: 'alpha'
    });
  </script>
</body>
</html>`
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(html))
}

func (a *API) DocsStatic(w http.ResponseWriter, r *http.Request) {
	if strings.HasSuffix(r.URL.Path, "/") || r.URL.Path == "/v1/docs" {
		a.DocsIndex(w, r)
		return
	}
	http.Redirect(w, r, "/v1/docs", http.StatusFound)
}

func testPagePath(name string) string {
	for _, root := range candidateRoots() {
		p := filepath.Join(root, "docs", "test", name)
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
	}
	return filepath.Join("docs", "test", name)
}

func (a *API) TestCreateVault(w http.ResponseWriter, r *http.Request) {
	b, err := os.ReadFile(testPagePath("create-vault.html"))
	if err != nil {
		http.Error(w, "test page missing", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(b)
}
