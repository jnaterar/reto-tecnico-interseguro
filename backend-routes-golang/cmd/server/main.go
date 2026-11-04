// Package main arranca el servicio de rutas óptimas de grúas.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/interseguro/reto-routes-golang/internal/auth"
	"github.com/interseguro/reto-routes-golang/internal/httpapi"
	"github.com/interseguro/reto-routes-golang/internal/service"
)

func main() {
	port := getEnv("PORT", "8081")
	secret := getEnv("JWT_SECRET", "dev-secret-change-me-please")
	ttlMinutes := getEnvInt("JWT_TTL_MINUTES", 60)
	enableDemoToken := getEnv("ENABLE_DEMO_TOKEN", "true") == "true"
	allowedOrigin := getEnv("CORS_ORIGIN", "*")

	authService, err := auth.NewService(secret, time.Duration(ttlMinutes)*time.Minute)
	if err != nil {
		log.Fatalf("configuración de auth inválida: %v", err)
	}

	server := httpapi.NewServer(service.NewRouteService(), authService, enableDemoToken, allowedOrigin)

	httpServer := &http.Server{
		Addr:              ":" + port,
		Handler:           server.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Printf("routes-optimal escuchando en :%s (api v1)", port)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("no se pudo iniciar el servidor: %v", err)
		}
	}()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	<-ctx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Printf("apagado no limpio: %v", err)
	}
	log.Println("routes-optimal detenido")
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
