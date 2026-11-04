// Package main implementa un healthcheck mínimo para la imagen distroless.
//
// El runtime (gcr.io/distroless/static) no incluye shell ni curl/wget, así que
// el HEALTHCHECK del Dockerfile no puede usar `CMD-SHELL`. En su lugar se
// compila este binario y se ejecuta directamente: sale con código 0 si
// GET /health responde 200 y con 1 en cualquier otro caso.
package main

import (
	"fmt"
	"net/http"
	"os"
	"time"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}

	client := &http.Client{Timeout: 3 * time.Second}
	url := fmt.Sprintf("http://127.0.0.1:%s/health", port)

	response, err := client.Get(url)
	if err != nil {
		fmt.Fprintf(os.Stderr, "healthcheck: %v\n", err)
		os.Exit(1)
	}
	defer func() { _ = response.Body.Close() }()

	if response.StatusCode != http.StatusOK {
		fmt.Fprintf(os.Stderr, "healthcheck: estado inesperado %d\n", response.StatusCode)
		os.Exit(1)
	}
}
