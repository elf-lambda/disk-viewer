document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  // UI Elements
  const ui = {
    dirPathInput: $("dirPath"),
    analyzeButton: $("analyzeBtn"),
    loading: $("loading"),
    error: $("error"),
    summary: $("summary"),
    scannedPath: $("scannedPath"),
    totalFiles: $("totalFiles"),
    totalSize: $("totalSize"),
    sizeCounts: $("sizeCounts"),
    topDirsSection: $("topDirectoriesSection"),
    topDirsList: $("topDirectoriesList"),
    topFilesSection: $("topFilesSection"),
    minFileSize: $("minFileSize"),
    topFilesList: $("topFilesList"),
    fileCount: $("fileCountDisplay"),
    pagination: $("filePaginationControls"),
    prevPage: $("prevPageBtn"),
    nextPage: $("nextPageBtn"),
    pageDisplay: $("pageDisplay"),
  };

  let allFiles = [],
    allDirs = [],
    filteredFiles = [],
    currentPage = 1;
  const itemsPerPage = 20;

  const formatBytes = (bytes, d = 2) => {
    if (!+bytes) return "0 Bytes";
    const k = 1024,
      sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(d)} ${sizes[i]}`;
  };

  const getParentDirectory = (path) => {
    const norm = path.replace(/\\/g, "/");
    const rootMatch = norm.match(/^([a-zA-Z]:\/?|\/)/);
    if (rootMatch && norm.length <= rootMatch[0].length) return null;
    const lastSlash = norm.lastIndexOf("/");
    if (lastSlash <= 0) return rootMatch?.[0]?.replace(/\/+$/, "") || null;
    return norm.substring(0, lastSlash);
  };

  const aggregateDirectorySizes = (files, root) => {
    const direct = {},
      allSet = new Set();
    const normRoot = root.replace(/\\/g, "/").replace(/\/+$/, "");
    direct[normRoot] = 0;
    allSet.add(normRoot);

    for (const { name, size } of files) {
      const filePath = name.replace(/\\/g, "/");
      const parent = getParentDirectory(filePath);
      const parentKey = (parent ?? normRoot).replace(/\/+$/, "");
      direct[parentKey] = (direct[parentKey] || 0) + size;

      let current = parent;
      while (current) {
        const clean = current.replace(/\/+$/, "");
        if (
          !clean.startsWith(normRoot) &&
          normRoot !== "/" &&
          !/^[a-zA-Z]:$/.test(normRoot)
        )
          break;
        allSet.add(clean);
        if (clean === normRoot) break;
        current = getParentDirectory(current);
      }

      if (
        parent === null &&
        (normRoot === "/" || /^[a-zA-Z]:$/.test(normRoot))
      ) {
        allSet.add(normRoot);
      }
    }

    const sortedDirs = Array.from(allSet).sort(
      (a, b) => b.split("/").length - a.split("/").length
    );
    const totals = { ...direct };

    for (const dir of sortedDirs) {
      const parent = getParentDirectory(
        dir + (/^[a-zA-Z]:$|^\/$/.test(dir) ? "" : "/dummy")
      );
      const key = parent?.replace(/\/+$/, "");
      if (key && allSet.has(key)) {
        totals[key] = (totals[key] || 0) + (totals[dir] || 0);
      }
    }

    return Object.entries(totals)
      .filter(([path, size]) => size > 0 || path === normRoot)
      .map(([path, size]) => ({ path, size }))
      .sort((a, b) => b.size - a.size);
  };

  // Generated code for display chart
  //
  //
  let fileSizeChart; // Store chart reference so we can destroy and redraw // Function to draw the file size distribution bar chart

  function drawFileSizeDistributionChart(sizeCounts) {
    // Get the canvas context
    const ctx = document
      .getElementById("fileSizeDistributionChart")
      .getContext("2d"); // Destroy existing chart if it exists before drawing a new one

    if (fileSizeChart) {
      fileSizeChart.destroy();
    } // Define all seven bins based on the MSizeCounter struct values from the backend // Calculate counts within each specific range (bin)

    const bins = [
      { label: "< 1 KB", count: sizeCounts.countLess1KB || 0 },
      {
        label: "1 KB - 1 MB", // count > 1KB MINUS count > 1MB
        count: (sizeCounts.countMore1KB || 0) - (sizeCounts.countMore1MB || 0),
      },
      {
        label: "1 MB - 5 MB", // count > 1MB MINUS count > 5MB
        count: (sizeCounts.countMore1MB || 0) - (sizeCounts.countMore5MB || 0),
      },
      {
        label: "5 MB - 100 MB", // count > 5MB MINUS count > 100MB
        count:
          (sizeCounts.countMore5MB || 0) - (sizeCounts.countMore100MB || 0),
      },
      {
        label: "100 MB - 512 MB", // count > 100MB MINUS count > 512MB
        count:
          (sizeCounts.countMore100MB || 0) - (sizeCounts.countMore512MB || 0),
      },
      {
        label: "512 MB - 1 GB", // Correct calculation: count > 512MB MINUS count > 1GB
        count:
          sizeCounts.countMore512MB || 0 /*- (sizeCounts.countMore1GB || 0)*/,
      },
      { label: "> 1 GB", count: sizeCounts.countMore1GB || 0 }, // count > 1GB
    ]; // Prepare data for the logarithmic scale

    bins.forEach((bin) => {
      // Handle potential negative values (shouldn't happen with correct backend data)
      if (bin.count < 0) bin.count = 0; // Log scale cannot plot 0. Use a very small positive value for bins with 0 files. // This makes the bar visible at the bottom of the log scale. // The tooltip will show the actual count (0).
      bin.displayCount = bin.count === 0 ? 0.1 : bin.count;
    }); // Extract labels and data for Chart.js

    const labels = bins.map((bin) => bin.label);
    const data = bins.map((bin) => bin.displayCount); // Data used for the chart's scale
    const actualCounts = bins.map((bin) => bin.count); // Actual counts used for tooltips // Visually appealing color scheme

    const colors = [
      "#4caf50", // < 1 KB (Green)
      "#8bc34a", // 1 KB - 1 MB (Light green)
      "#cddc39", // 1 MB - 5 MB (Lime)
      "#ffc107", // 5 MB - 100 MB (Amber)
      "#ff9800", // 100 MB - 512 MB (Orange)
      "#f44336", // 512 MB - 1 GB (Red)
      "#9c27b0", // > 1 GB (Purple)
    ]; // Create the new Chart.js bar chart

    fileSizeChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Number of Files",
            data: data, // Plot the adjusted data for log scale
            backgroundColor: colors,
            borderColor: colors.map((color) => color),
            borderWidth: 1,
            barPercentage: 1, // Controls bar width relative to category space
            categoryPercentage: 0.8, // Controls category width relative to total space
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false, // Allow chart to resize freely
        layout: {
          padding: {
            top: 20,
            right: 20,
            bottom: 60, // Padding below chart for x-axis labels
            left: 40, // Padding left for y-axis labels
          },
        },
        plugins: {
          legend: {
            display: false, // Hide the dataset legend
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                // Show the actual count in the tooltip
                const index = context.dataIndex;
                const count = actualCounts[index];
                return `${count.toLocaleString()} file${
                  count !== 1 ? "s" : ""
                }`;
              },
            },
          },
          title: {
            display: true,
            text: "File Size Distribution",
            font: {
              size: 16, // Chart title font size
              weight: "bold",
            },
            padding: {
              top: 10,
              bottom: 15, // Padding below title
            },
          },
        },
        scales: {
          y: {
            type: "logarithmic", // Use logarithmic scale
            min: 0.1, // Set a minimum slightly above zero for visualization
            title: {
              display: true,
              text: "",
              font: {
                size: 12, // Y-axis title font size
                weight: "bold",
              },
              padding: {
                bottom: 5,
              },
            },
            grid: {
              color: "rgba(0, 0, 0, 0.1)", // Grid line color for light background
            },
            ticks: {
              color: "rgba(0, 0, 0, 0.9)", // Tick label color for light background
              font: {
                size: 10, // Y-axis tick label font size
              },
              padding: 5,
              // --- REMOVED the custom callback entirely ---
              // Let Chart.js use its default logarithmic tick placement and formatting
            },
          },
          x: {
            title: {
              display: true,
              text: "File Size Range",
              font: {
                size: 12, // X-axis title font size
                weight: "bold",
              },
              padding: {
                top: 10,
              },
            },
            grid: {
              display: false, // Hide x-axis grid lines
            },
            ticks: {
              color: "rgba(0, 0, 0, 0.9)", // Tick label color
              font: {
                size: 10, // X-axis tick label font size
              },
              maxRotation: 0, // Force labels horizontal
              minRotation: 0,
              padding: 5,
            },
          },
        },
        animation: {
          duration: 500, // Faster animation
        },
      },
    }); // Set canvas size (CSS will primarily control max size now)

    const canvas = document.getElementById("fileSizeDistributionChart"); // Keep these JS styles - CSS max-width/height on the container will control the display size
    canvas.style.height = "450px";
    canvas.style.width = "100%"; // Also set parent container size if available (CSS max-width/height takes priority)

    if (canvas.parentNode) {
      canvas.parentNode.style.height = "450px"; // JS height might be overridden by CSS max-height
      canvas.parentNode.style.minWidth = "600px"; // Keep a JS min-width as a fallback
      canvas.parentNode.style.marginBottom = "30px";
    } // Force Chart.js to properly resize the chart after DOM updates

    setTimeout(() => {
      if (fileSizeChart) fileSizeChart.resize();
    }, 100); // This hack might still be needed depending on browser/font rendering

    setTimeout(() => {
      const xAxisLabels = document.querySelectorAll(
        "#fileSizeDistributionChart .chartjs-category-axis .tick text"
      );
      xAxisLabels.forEach((label) => {
        label.setAttribute("dy", "1em"); // Move labels down
      });
    }, 200);
  }

  const displaySummary = (data) => {
    ui.scannedPath.textContent = data.scannedPath || "N/A";
    ui.totalFiles.textContent = (data.fileCount || 0).toLocaleString();
    ui.totalSize.textContent = formatBytes(data.totalSize || 0);

    const c = data.sizeCounts || {};
    drawFileSizeDistributionChart(data.sizeCounts);

    ui.sizeCounts.innerHTML = `
        <li>&lt; 1 KB: ${c.countLess1KB?.toLocaleString() || 0}</li>
        <li>&gt; 1 KB: ${c.countMore1KB?.toLocaleString() || 0}</li>
        <li>&gt; 1 MB: ${c.countMore1MB?.toLocaleString() || 0}</li>
        <li>&gt; 5 MB: ${c.countMore5MB?.toLocaleString() || 0}</li>
        <li>&gt; 100 MB: ${c.countMore100MB?.toLocaleString() || 0}</li>
        <li>&gt; 512 MB: ${c.countMore512MB?.toLocaleString() || 0}</li>
        <li>&gt; 1 GB: ${c.countMore1GB?.toLocaleString() || 0}</li>`;
    ui.summary.classList.remove("hidden");
  };

  const displayTopDirectories = (dirs, limit = 20) => {
    ui.topDirsList.innerHTML = "";
    const root = ui.scannedPath.textContent
      .replace(/\\/g, "/")
      .replace(/\/+$/, "");
    const top = dirs
      .filter(
        (d) =>
          d.size > 0 && d.path.replace(/\\/g, "/").replace(/\/+$/, "") !== root
      )
      .slice(0, limit);
    ui.topDirsList.innerHTML = top.length
      ? top
          .map(
            (d) =>
              `<li><span class="path" title="${d.path}">${
                d.path
              }</span> <span class="size">${formatBytes(d.size)}</span></li>`
          )
          .join("")
      : "<li>No significant directories found.</li>";
    ui.topDirsSection.classList.remove("hidden");
  };

  const displayCurrentPageOfFiles = () => {
    ui.topFilesList.innerHTML = "";
    if (!filteredFiles.length) {
      ui.topFilesList.innerHTML =
        "<li>No files found meeting the current criteria.</li>";
      ui.fileCount.textContent = "(0 files)";
      ui.pagination.classList.add("hidden");
      ui.topFilesSection.classList.remove("hidden");
      return;
    }

    const start = (currentPage - 1) * itemsPerPage;
    const files = filteredFiles.slice(start, start + itemsPerPage);
    ui.fileCount.textContent = `(${files.length} shown on this page, ${filteredFiles.length} total)`;
    ui.topFilesList.innerHTML = files
      .map(
        (f) =>
          `<li><span class="path" title="${f.name}">${
            f.name
          }</span> <span class="size" title="Actual Bytes: ${f.size.toLocaleString()}">${formatBytes(
            f.size
          )}</span></li>`
      )
      .join("");

    ui.topFilesSection.classList.remove("hidden");
    updatePaginationControls();
  };

  const updatePaginationControls = () => {
    const totalPages = Math.ceil(filteredFiles.length / itemsPerPage);
    if (totalPages <= 1) {
      ui.pagination.classList.add("hidden");
      ui.pageDisplay.textContent = "Page 1 of 1";
      return;
    }
    ui.pagination.classList.remove("hidden");
    ui.pageDisplay.textContent = `Page ${currentPage} of ${totalPages}`;
    ui.prevPage.disabled = currentPage === 1;
    ui.nextPage.disabled = currentPage === totalPages;
  };

  const filterSortAndPaginate = (minSize) => {
    filteredFiles = allFiles
      .filter((f) => f.size >= minSize)
      .sort((a, b) => b.size - a.size);
    currentPage = 1;
    displayCurrentPageOfFiles();
  };

  const fetchData = async (path) => {
    ui.loading.classList.remove("hidden");
    ui.error.classList.add("hidden");
    [ui.summary, ui.topDirsSection, ui.topFilesSection, ui.pagination].forEach(
      (el) => el.classList.add("hidden")
    );

    try {
      const res = await fetch(`/api/analyze?dir=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error(`Server Error: ${res.statusText}`);
      const data = await res.json();

      allFiles = (data.files || []).filter((f) => f.size > 0);
      displaySummary(data);

      allDirs = aggregateDirectorySizes(allFiles, data.scannedPath);
      displayTopDirectories(allDirs);
      filterSortAndPaginate(parseInt(ui.minFileSize.value, 10));
    } catch (err) {
      ui.error.textContent = `Failed to load data: ${err.message}`;
      ui.error.classList.remove("hidden");
    } finally {
      ui.loading.classList.add("hidden");
    }
  };

  ui.analyzeButton.addEventListener("click", () => {
    const path = ui.dirPathInput.value.trim();
    if (!path) {
      ui.error.textContent = "Please enter a directory path.";
      ui.error.classList.remove("hidden");
    } else {
      fetchData(path);
    }
  });

  ui.minFileSize.addEventListener("change", () =>
    filterSortAndPaginate(parseInt(ui.minFileSize.value, 10))
  );

  ui.prevPage?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      displayCurrentPageOfFiles();
    }
  });

  ui.nextPage?.addEventListener("click", () => {
    const totalPages = Math.ceil(filteredFiles.length / itemsPerPage);
    if (currentPage < totalPages) {
      currentPage++;
      displayCurrentPageOfFiles();
    }
  });
});
