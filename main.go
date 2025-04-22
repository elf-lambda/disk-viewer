package main

import (
	"disk-viewer/filewalker"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

func main() {
	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/", fs)

	http.HandleFunc("/api/analyze", handleAnalyzeRequest)

	port := "8080"
	fmt.Printf("Starting server on http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func handleAnalyzeRequest(w http.ResponseWriter, r *http.Request) {
	// Getting directory from /apy/analyze?dir=C:/ for example
	targetDir := r.URL.Query().Get("dir")
	if targetDir == "" {
		log.Println("Request error: Missing 'dir' query parameter")
		http.Error(w, "Missing 'dir' query parameter", http.StatusBadRequest)
		return
	}

	if !filewalker.IsValidScanPath(targetDir) {
		log.Printf("Security Alert: Invalid or disallowed path requested: %s", targetDir)
		http.Error(w, fmt.Sprintf("Invalid or disallowed path: %s", targetDir), http.StatusBadRequest)
		return
	}

	log.Printf("Received request to analyze validated directory: %s", targetDir)
	start := time.Now()

	result, err := filewalker.AnalyzeDirectory(targetDir)

	duration := time.Since(start)
	log.Printf("Analysis for %s completed in %v", targetDir, duration)

	if err != nil {
		log.Printf("Error analyzing directory %s: %v", targetDir, err)
		http.Error(w, fmt.Sprintf("Error analyzing directory. Check server logs for details. Error: %v", err), http.StatusInternalServerError)
		return
	}

	log.Printf("Analysis successful for %s. Files: %d, Total Size: %s", targetDir, result.FileCount, filewalker.FormatSize(result.TotalSize))

	w.Header().Set("Content-Type", "application/json")
	err = json.NewEncoder(w).Encode(result)
	if err != nil {
		log.Printf("Error encoding JSON response for %s: %v", targetDir, err)
	}
}
