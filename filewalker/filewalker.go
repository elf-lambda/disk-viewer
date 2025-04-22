package filewalker

import (
	"fmt"
	"io/fs"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const (
	EXTENSION_SIZE = 24
	KB             = 1024
	MB             = 1024 * KB
	FiveMB         = 5 * MB
	HundredMB      = 100 * MB
	FiveTwelveMB   = 512 * MB
	GB             = 1000 * MB
)

type MFile struct {
	Name string `json:"name"`
	Size int64  `json:"size"`
	Ext  string `json:"ext"`
}

type MSizeCounter struct {
	CountLess1KB   int `json:"countLess1KB"`
	CountMore1KB   int `json:"countMore1KB"`
	CountMore1MB   int `json:"countMore1MB"`
	CountMore5MB   int `json:"countMore5MB"`
	CountMore100MB int `json:"countMore100MB"`
	CountMore512MB int `json:"countMore512MB"`
	CountMore1GB   int `json:"countMore1GB"`
}

type AnalysisResult struct {
	Files       []MFile      `json:"files"`
	SizeCounts  MSizeCounter `json:"sizeCounts"`
	TotalSize   int64        `json:"totalSize"`
	FileCount   int          `json:"fileCount"`
	ScannedPath string       `json:"scannedPath"`
}

func IsValidScanPath(path string) bool {
	// Dont allow ".." path
	if strings.Contains(path, "..") {
		fmt.Printf("Validation failed: Path contains '..': %s\n", path)
		return false
	}

	// Guarantee Full Path
	if !filepath.IsAbs(path) {
		fmt.Printf("Validation failed: Path is not absolute: %s\n", path)
		return false
	}

	return true
}

// Analyze directory gets all files as
// fullpath name, size, and extension (extension unused atm)
// This also assumes the path was already validated by the caller
func AnalyzeDirectory(root string) (AnalysisResult, error) {
	fmt.Printf("Starting analysis for path: %s\n", root)

	files := make([]MFile, 0, 128_000)
	counter := MSizeCounter{}
	var totalSize int64

	walkStartTime := time.Now()

	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			fmt.Printf("Warning: Access error for %s: %v. Skipping...\n", path, err)
			if d != nil && d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}

		if d.IsDir() {
			return nil
		}

		info, err := d.Info()
		if err != nil {
			fmt.Printf("Warning: Cannot get info for %s: %v. Skipping...\n", path, err)
			return nil
		}

		size := info.Size()
		// Skip empty files
		if size == 0 {
			return nil
		}

		totalSize += size

		switch {
		case size > GB:
			counter.CountMore1GB++
		case size > FiveTwelveMB:
			counter.CountMore512MB++
		case size > HundredMB:
			counter.CountMore100MB++
		case size > FiveMB:
			counter.CountMore5MB++
		case size > MB:
			counter.CountMore1MB++
		case size > KB:
			counter.CountMore1KB++
		default:
			counter.CountLess1KB++
		}

		ext := getFileExtension(path)

		files = append(files, MFile{
			Name: filepath.ToSlash(path), // Normalize to forward / the path
			Size: size,
			Ext:  ext,
		})

		return nil
	})

	fmt.Printf("WalkDir finished in %v. Found %d raw file entries.\n", time.Since(walkStartTime), len(files))

	if err != nil {
		return AnalysisResult{}, fmt.Errorf("error walking directory %s: %w", root, err)
	}

	result := AnalysisResult{
		Files:       files, // sending all files, big json!
		SizeCounts:  counter,
		TotalSize:   totalSize,
		FileCount:   len(files),
		ScannedPath: root,
	}
	showMemoryUsage()
	return result, nil
}

func getFileExtension(name string) string {
	ext := filepath.Ext(name)
	if ext == "" {
		return "<no ext>"
	}

	ext = strings.ToLower(ext[1:])
	if len(ext) >= EXTENSION_SIZE {
		return "<long ext>"
	}
	if ext == "" {
		return "<hidden>"
	}
	return "." + ext
}

func FormatSize(bytes int64) string {
	suffixes := []string{"B", "KB", "MB", "GB", "TB"}
	size := float64(bytes)
	i := 0
	for size >= 1024 && i < len(suffixes)-1 {
		size /= 1024
		i++
	}
	return fmt.Sprintf("%.2f %s", size, suffixes[i])
}

func showMemoryUsage() {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	fmt.Printf("Memory Usage: Alloc = %v MiB, TotalAlloc = %v MiB, Sys = %v MiB\n",
		m.Alloc/1024/1024, m.TotalAlloc/1024/1024, m.Sys/1024/1024)
}
