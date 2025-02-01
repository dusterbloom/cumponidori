import React, { useState } from 'react';
import { Container, Typography, Box, Alert, CircularProgress, FormControlLabel, Checkbox, Button } from '@mui/material';
import SearchForm from './components/SearchForm';
import ResultsTable from './components/ResultsTable';
import CSVExplorer from './components/CSVExplorer';
import { searchProjects, getProcedureLinks, getDocumentLinks, getDocumentDownloadUrl } from './api';
import axios from 'axios'; // We'll use a local axios instance for downloads too.

const STATUS_OPTIONS = [
  'Valutazione preliminare',
  'Verifica di Ottemperanza',
  'Valutazione Impatto Ambientale',
  'Valutazione Impatto Ambientale (PNIEC-PNRR)',
  'Verifica di Assoggettabilità a VIA',
  'Provvedimento Unico in materia Ambientale (PNIEC-PNRR)',
  'Definizione contenuti SIA (PNIEC-PNRR)'
];

const App = () => {
  // State
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [currentKeyword, setCurrentKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // For selection + downloads
  const [selectedProjects, setSelectedProjects] = useState([]);
  const [downloadingDocuments, setDownloadingDocuments] = useState(false);

  // Single Axios instance for large/slow downloads: no short timeout
  const downloadClient = axios.create({
    baseURL: import.meta.env.PROD
      ? 'https://cumponidori.onrender.com'
      : 'http://localhost:3005',
    // Remove or greatly increase the default timeout:
    timeout: 120000, // 2 minutes, or remove it entirely
    headers: { 'Content-Type': 'application/json' },
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
    setSelectedProjects(checked ? results.map(project => project.id) : []);
  };

  // Individual project checkbox
  const handleSelectProject = (projectId, checked) => {
    setSelectedProjects(prev =>
      checked
        ? [...prev, projectId]
        : prev.filter(id => id !== projectId)
    );
  };

  /**
   * Download each selected project's documents by:
   *   1) calling /api/procedure to get procedure URLs
   *   2) calling /api/documents for each procedure URL
   *   3) calling /api/download for each document
   *   4) create a Blob + anchor to trigger the browser's "Save File" dialog
   *
   * We'll do a short delay between downloads to avoid spamming the server.
   */
  const handleDownloadDocuments = async () => {
    if (!selectedProjects?.length) return;
    setDownloadingDocuments(true);
    setError(null);
  
    try {
      for (const projectId of selectedProjects) {
        const project = results?.find(p => p?.id === projectId);
        if (!project) {
          console.warn(`Project ${projectId} not found in results`);
          continue;
        }
  
        console.log(`Fetching procedure links for: ${project.title}`);
        const procedureLinks = await getProcedureLinks(project.url);
  
        for (const procedureUrl of procedureLinks) {
          if (!procedureUrl) continue;
          
          console.log(`Fetching document links for procedure: ${procedureUrl}`);
          const documents = await getDocumentLinks(procedureUrl);
  
          for (const doc of documents) {
            const filename = doc?.filename || 'document.pdf';
            const downloadUrl = doc?.downloadUrl;
            
            if (!downloadUrl) {
              console.warn(`Document missing download URL:`, doc);
              continue;
            }
  
            try {
              console.log(`Downloading document: ${filename}`);
              
              const iframe = document.createElement('iframe');
              iframe.style.display = 'none';
              document.body.appendChild(iframe);
              
              // Use the helper function here
              iframe.src = getDocumentDownloadUrl(downloadUrl);
              
              setTimeout(() => {
                if (iframe?.parentNode) {
                  iframe.parentNode.removeChild(iframe);
                }
              }, 5000);
  
              await new Promise(resolve => setTimeout(resolve, 1500));
            } catch (e) {
              console.error('Error downloading document:', e);
            }
          }
        }
      }
  
      console.log('Download process completed');
    } catch (e) {
      console.error('Error while downloading documents:', e);
      setError(`Error while downloading: ${e.message}`);
    } finally {
      setDownloadingDocuments(false);
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
      <Box sx={{ mb: 2, display: 'flex', gap: 2 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={selectedProjects.length === displayedResults.length && displayedResults.length > 0}
              onChange={(e) => handleSelectAll(e.target.checked)}
            />
          }
          label="Seleziona tutto (Pagina corrente)"
        />

        <select
          value={statusFilter}
          onChange={handleStatusFilterChange}
          style={{ height: '40px', fontSize: '16px', padding: '5px' }}
        >
          <option value="all">Tutti gli stati di avanzamento</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <Button
          variant="contained"
          color="primary"
          disabled={!selectedProjects.length || downloadingDocuments}
          onClick={handleDownloadDocuments}
        >
          {downloadingDocuments ? 'Downloading...' : 'Scarica i documenti'}
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

      <Box sx={{ mt: 4 }}>
        <Typography variant="h5" align="center" gutterBottom>
          CSV Explorer
        </Typography>
        <CSVExplorer />
      </Box>

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

      {/* No results message */}
      {!loading && !error && results.length === 0 && currentKeyword && (
        <Alert severity="info">
         Nudda. Intenda chircare mellus.
        </Alert>
      )}
    </Container>
  );
};

export default App;
