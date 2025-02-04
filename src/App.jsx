import React, { useState } from "react";
import {
  Container,
  Typography,
  Box,
  Alert,
  CircularProgress,
  FormControlLabel,
  Checkbox,
  Button,
  LinearProgress
} from "@mui/material";
import SearchForm from "./components/SearchForm";
import ResultsTable from "./components/ResultsTable";
import CSVExplorer from "./components/CSVExplorer";
import PDFExplorer from "./components/PDFExplorer"; // <-- New import for PDF handling
import {
  searchProjects,
  getProcedureLinks,
  getDocumentLinks,
  getDocumentDownloadUrl,
} from "./api";
import axios from "axios";


const STATUS_OPTIONS = [
  "Valutazione preliminare",
  "Verifica di Ottemperanza",
  "Valutazione Impatto Ambientale",
  "Valutazione Impatto Ambientale (PNIEC-PNRR)",
  "Verifica di Assoggettabilità a VIA",
  "Provvedimento Unico in materia Ambientale (PNIEC-PNRR)",
  "Definizione contenuti SIA (PNIEC-PNRR)",
];

const App = () => {
  // State
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [currentKeyword, setCurrentKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // For selection + downloads
  const [selectedProjects, setSelectedProjects] = useState([]);
  const [downloadingDocuments, setDownloadingDocuments] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
  const [downloadMode, setDownloadMode] = useState('browser'); // 'browser' or 'directory'

  // Check if File System Access API is supported
  const isFileSystemAccessSupported = () => {
    return 'showDirectoryPicker' in window;
  };


  // Toggle display for CSV and PDF explorers
  const [showCSVExplorer, setShowCSVExplorer] = useState(false);
  const [showPDFExplorer, setShowPDFExplorer] = useState(false);

  // Single Axios instance for large/slow downloads: no short timeout
  const downloadClient = axios.create({
    baseURL: import.meta.env.PROD
      ? "https://cumponidori.onrender.com"
      : "http://localhost:3005",
    timeout: 120000, // 2 minutes, or remove it entirely
    headers: { "Content-Type": "application/json" },
  });

  // Perform search
  const performSearch = async (keyword, pageNum, status) => {
    if (!keyword?.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const data = await searchProjects(keyword.trim(), pageNum, status);
      setResults(data.projects || []);
      setTotalPages(data.totalPages || 1);
      setPage(pageNum);
    } catch (err) {
      setError(err.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // Handlers
  const handleSearch = (keyword) => {
    setCurrentKeyword(keyword);
    performSearch(keyword, 1, statusFilter);
  };

  const handleStatusFilterChange = (event) => {
    const newStatus = event.target.value;
    setStatusFilter(newStatus);
    performSearch(currentKeyword, 1, newStatus); // Reset to page 1
  };

  const handlePageChange = (newPage) => {
    if (currentKeyword) {
      performSearch(currentKeyword, newPage, statusFilter);
    }
  };

  // "Select all" checkbox
  const handleSelectAll = (checked) => {
    setSelectedProjects(checked ? results.map((project) => project.id) : []);
  };

  // Individual project checkbox
  const handleSelectProject = (projectId, checked) => {
    setSelectedProjects((prev) =>
      checked ? [...prev, projectId] : prev.filter((id) => id !== projectId)
    );
  };


  // Traditional browser download using blob + anchor
  const downloadWithBrowser = async (url, filename) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(blobUrl);
      return true;
    } catch (error) {
      console.error(`Error downloading ${filename}:`, error);
      return false;
    }
  };

  // Directory-based download using File System Access API
  const downloadWithFileSystem = async (dirHandle, url, filename) => {
    try {
      // Verify permissions
      const permissionState = await dirHandle.queryPermission({ mode: 'readwrite' });
      if (permissionState === 'denied') {
        throw new Error('Write permission denied');
      }
      if (permissionState === 'prompt') {
        const newPermission = await dirHandle.requestPermission({ mode: 'readwrite' });
        if (newPermission !== 'granted') {
          throw new Error('Write permission denied');
        }
      }

      // Get file handle and create writable
      const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();

      // Fetch and write the file
      const response = await fetch(url);
      const blob = await response.blob();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error) {
      console.error(`Error saving ${filename}:`, error);
      return false;
    }
  };

  const handleDownloadDocuments = async () => {
    if (!selectedProjects?.length) return;
    setDownloadingDocuments(true);
    setError(null);

    let dirHandle = null;
    
    // Try to use directory picker if supported
    if (isFileSystemAccessSupported()) {
      try {
        dirHandle = await window.showDirectoryPicker();
        setDownloadMode('directory');
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.warn('Directory picker failed, falling back to browser download:', error);
        }
        setDownloadMode('browser');
      }
    }

    try {
      // Calculate total files
      let totalFiles = 0;
      let downloadedFiles = 0;

      // First pass to count files
      for (const projectId of selectedProjects) {
        const project = results?.find(p => p?.id === projectId);
        if (!project) continue;
        
        const procedureLinks = await getProcedureLinks(project.url);
        for (const procedureUrl of procedureLinks) {
          if (!procedureUrl) continue;
          const documents = await getDocumentLinks(procedureUrl);
          totalFiles += documents.length;
        }
      }

      setDownloadProgress({ current: 0, total: totalFiles });

      // Second pass to download files
      for (const projectId of selectedProjects) {
        const project = results?.find(p => p?.id === projectId);
        if (!project) continue;

        const procedureLinks = await getProcedureLinks(project.url);
        
        for (const procedureUrl of procedureLinks) {
          if (!procedureUrl) continue;

          const documents = await getDocumentLinks(procedureUrl);
          
          for (const doc of documents) {
            if (!doc?.downloadUrl) continue;
            
            let filename = doc?.filename || "document.pdf";
            filename = filename.replace(/^attachment; filename=["']?/, '').replace(/["']$/, '');
            const safeFilename = `${projectId}_${filename.replace(/[\\\/\*?:"<>|]/g, "_")}`;
            
            const downloadUrl = getDocumentDownloadUrl(doc.downloadUrl);

            let success = false;
            if (dirHandle) {
              success = await downloadWithFileSystem(dirHandle, downloadUrl, safeFilename);
              if (!success) {
                // If directory download fails, fall back to browser download
                success = await downloadWithBrowser(downloadUrl, safeFilename);
              }
            } else {
              success = await downloadWithBrowser(downloadUrl, safeFilename);
            }

            if (success) {
              downloadedFiles++;
              setDownloadProgress({ current: downloadedFiles, total: totalFiles });
            }

            // Delay between downloads
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

    } catch (error) {
      console.error('Download process error:', error);
      setError(`Download error: ${error.message}`);
    } finally {
      setDownloadingDocuments(false);
      setDownloadProgress({ current: 0, total: 0 });
    }
  };


  const displayedResults = results;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        Cumponidori
      </Typography>

      <SearchForm onSearch={handleSearch} />

      {/* Single Status Filter up here */}
      <Box sx={{ mb: 2, display: "flex", gap: 2 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={
                selectedProjects.length === displayedResults.length &&
                displayedResults.length > 0
              }
              onChange={(e) => handleSelectAll(e.target.checked)}
            />
          }
          label="Seleziona tutto (Pagina corrente)"
        />

        {/* <select
          value={statusFilter}
          onChange={handleStatusFilterChange}
          style={{ height: "40px", fontSize: "16px", padding: "5px" }}
        >
          <option value="all">Tutti gli stati di avanzamento</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select> */}

        <Button
        variant="contained"
        color="primary"
        disabled={!selectedProjects.length || downloadingDocuments}
        onClick={handleDownloadDocuments}
      >
        {downloadingDocuments ? 
          `Scaricando (${downloadMode === 'directory' ? 'nella cartella' : 'to downloads folder'})...` : 
          "Scarica i documenti selezionati"
        }
      </Button>

         {/* New button for exploring PDFs */}
         <Button
          variant="contained"
          onClick={() => setShowPDFExplorer((prev) => !prev)}
        >
          {showPDFExplorer ? "Nascondi PRUGADORI" : "PRUGADORI PDF"}
        </Button>


        <Button
          variant="contained"
          onClick={() => setShowCSVExplorer((prev) => !prev)}
        >
          {showCSVExplorer ? "Nascondi SUADORI" : "SUADORI CSV"}
        </Button>
        </Box>

     
      {loading && (
        <Box display="flex" justifyContent="center" my={4}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Results */}
      {!loading && !error && displayedResults.length > 0 && (
        <ResultsTable
          results={displayedResults}
          page={page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          selectedProjects={selectedProjects}
          onSelectProject={handleSelectProject}
        />
      )}

      {downloadingDocuments && downloadProgress.total > 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Scaricando: {downloadProgress.current} di {downloadProgress.total} files
          <LinearProgress 
            variant="determinate" 
            value={(downloadProgress.current / downloadProgress.total) * 100}
            sx={{ mt: 1 }}
          />
        </Alert>
      )}
      
      {!loading && !error && results.length === 0 && currentKeyword && (
        <Alert severity="info">Nudda. Intenda chircare mellus.</Alert>
      )}

      {/* Conditionally render the CSV Explorer */}
      {showCSVExplorer && (
        <Box sx={{ mt: 4 }}>
          <CSVExplorer />
        </Box>
      )}

      {/* Conditionally render the new PDF Explorer */}
      {showPDFExplorer && (
        <Box sx={{ mt: 4 }}>
          <PDFExplorer />
        </Box>
      )}
    </Container>
  );
};

export default App;
