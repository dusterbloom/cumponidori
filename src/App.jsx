import React, { useState } from 'react';
import { Container, Typography, Box, Alert, CircularProgress } from '@mui/material';
import SearchForm from './components/SearchForm';
import ResultsTable from './components/ResultsTable';
import { searchProjects, getProcedureLinks, getDocumentLinks } from './api';
import { FormControl, InputLabel, Select, MenuItem, FormControlLabel, Checkbox, Button } from '@mui/material';

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
  // Initialize all state
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [currentKeyword, setCurrentKeyword] = useState('');
  const [selectedProjects, setSelectedProjects] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [downloadingDocuments, setDownloadingDocuments] = useState(false);


  const performSearch = async (searchKeyword, pageNum, status) => {
    if (!searchKeyword?.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const data = await searchProjects(searchKeyword.trim(), pageNum, status);
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
    if (currentKeyword) {
      performSearch(currentKeyword, 1, newStatus);
    }
  };

  const handlePageChange = (newPage) => {
    if (currentKeyword) {
      performSearch(currentKeyword, newPage, statusFilter);
    }
  };

  const handleSelectAll = (checked) => {
    setSelectedProjects(checked ? results.map(project => project.id) : []);
  };

  const handleSelectProject = (projectId, checked) => {
    setSelectedProjects(prev => 
      checked 
        ? [...prev, projectId]
        : prev.filter(id => id !== projectId)
    );
  };


  
  const downloadDocument = async (downloadUrl, filename) => {
    try {
      const response = await fetch(downloadUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/pdf,application/octet-stream',
        },
      });
  
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
  
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url); // Clean up
    } catch (error) {
      console.error(`Error downloading ${filename}:`, error);
      throw error; // Re-throw to be handled by caller
    }
  };


  const handleDownloadDocuments = async () => {
    setDownloadingDocuments(true);
    setError(null);
  
    try {
      for (const projectId of selectedProjects) {
        const project = results.find((p) => p.id === projectId);
        if (!project) continue;
  
        console.log(`Processing project: ${project.title}`);
  
        try {
          // Step 1: Get procedure links
          const procedureLinks = await getProcedureLinks(project.url);
          console.log(`Found ${procedureLinks.length} procedure links for project ${project.title}`);
          
          // Step 2: Get document links for each procedure
          for (const procedureUrl of procedureLinks) {
            try {
              const documents = await getDocumentLinks(procedureUrl);
              console.log(`Found ${documents.length} documents for procedure ${procedureUrl}`);
              
              // Step 3: Download each document
              for (const doc of documents) {
                try {
                  await downloadDocument(doc.id, doc.filename);
                  console.log(`Successfully downloaded ${doc.filename}`);
                  // Add delay between downloads
                  await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                  console.error(`Failed to download ${doc.filename}:`, error);
                  // Continue with next document even if one fails
                }
              }
            } catch (error) {
              console.error(`Failed to process procedure ${procedureUrl}:`, error);
              // Continue with next procedure even if one fails
            }
          }
        } catch (error) {
          console.error(`Failed to process project ${project.title}:`, error);
          // Continue with next project even if one fails
        }
      }
  
      setDownloadingDocuments(false);
      console.log('All documents downloaded successfully.');
    } catch (error) {
      setError(`Error downloading documents: ${error.message}`);
      setDownloadingDocuments(false);
      console.error('Error downloading documents:', error);
    }
  };


  
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        Project Search
      </Typography>
      
      <SearchForm onSearch={handleSearch} />
      
      <Box sx={{ mb: 2, display: 'flex', gap: 2 }}>
        <FormControl sx={{ minWidth: 300 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={statusFilter}
            label="Status"
            onChange={handleStatusFilterChange}
          >
            <MenuItem value="all">All</MenuItem>
            {STATUS_OPTIONS.map((status) => (
              <MenuItem key={status} value={status}>
                {status}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
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
      
      {!loading && !error && results.length > 0 && (
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={selectedProjects.length === results.length}
                onChange={(e) => handleSelectAll(e.target.checked)}
              />
            }
            label="Select All"
          />
          <Button
            variant="contained"
            color="primary"
            disabled={selectedProjects.length === 0 || downloadingDocuments}
            onClick={handleDownloadDocuments}
          >
            {downloadingDocuments ? 'Downloading...' : 'Download Documents'}
          </Button>
        </Box>
      )}

      {!loading && !error && results.length > 0 && (
        <ResultsTable 
          results={results} 
          page={page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          selectedProjects={selectedProjects}
          onSelectProject={handleSelectProject}
        />
      )}
      
      {!loading && !error && results.length === 0 && currentKeyword && (
        <Alert severity="info">
          No results found. Try a different search term.
        </Alert>
      )}
    </Container>
  );
};

export default App;