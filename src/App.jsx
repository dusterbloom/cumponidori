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


  const downloadDocument = async (doc) => {
    try {
      if (!doc.downloadUrl) {
        throw new Error('Download URL is missing');
      }
  
      console.log(`Attempting to download from: ${doc.downloadUrl}`);
      
      // Use our proxy endpoint instead of direct download
      const apiUrl = process.env.NODE_ENV === 'production'
      ? process.env.REACT_APP_API_URL
      : 'http://localhost:3001';
      
      // Use the API instance to make the request
      const response = await api.get('/api/download', {
        params: { url: doc.downloadUrl },
        responseType: 'blob'  // Important for handling binary data
      });
  
      // Create blob from response
      const blob = new Blob([response.data], { 
        type: response.headers['content-type'] || 'application/pdf' 
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = url;
      link.setAttribute('download', doc.filename || 'document.pdf');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the URL object after a short delay
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 100);
      
      console.log(`Successfully downloaded: ${doc.filename}`);
      // Add a delay between downloads
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error downloading ${doc.filename || 'document'}:`, error);
      throw error;
    }
  };
  
  const handleDownloadDocuments = async () => {
    try {
      // Let user select a directory using File System Access API
      const dirHandle = await window.showDirectoryPicker();
      
      setDownloadingDocuments(true);
      setError(null);
  
      // Create base folder structure similar to tzeracu.py
      const baseFolder = await dirHandle.getDirectoryHandle('downloads', { create: true });
      const searchFolder = await baseFolder.getDirectoryHandle(
        currentKeyword.replace(/[^a-z0-9]/gi, '_'), 
        { create: true }
      );
      const projectsFolder = await searchFolder.getDirectoryHandle('Progetti', { create: true });
  
      for (const projectId of selectedProjects) {
        const project = results.find((p) => p.id === projectId);
        if (!project) continue;
  
        // Create project folder with ID and description (sanitized)
        const folderName = `${project.id}_${project.title.replace(/[^a-z0-9]/gi, '_').slice(0, 100)}`;
        const projectFolder = await projectsFolder.getDirectoryHandle(folderName, { create: true });
  
        console.log(`Processing project: ${project.title}`);
  
        try {
          const procedureLinks = await getProcedureLinks(project.url);
          
          for (const procedureUrl of procedureLinks) {
            try {
              const documents = await getDocumentLinks(procedureUrl);
              
              for (const doc of documents) {
                try {
                  if (!doc.downloadUrl) continue;
                  
                  // Download file
                  const response = await api.get('/api/download', {
                    params: { url: doc.downloadUrl },
                    responseType: 'blob'
                  });
  
                  // Save file with sanitized name
                  const safeFilename = doc.filename.replace(/[^a-z0-9.]/gi, '_');
                  const fileHandle = await projectFolder.getFileHandle(
                    safeFilename,
                    { create: true }
                  );
                  const writable = await fileHandle.createWritable();
                  await writable.write(response.data);
                  await writable.close();
                  
                  console.log(`Saved: ${safeFilename}`);
                  await new Promise(resolve => setTimeout(resolve, 1000)); // Polite delay
                } catch (error) {
                  console.error(`Failed to save document:`, error);
                }
              }
            } catch (error) {
              console.error(`Failed to process procedure ${procedureUrl}:`, error);
            }
          }
        } catch (error) {
          console.error(`Failed to get procedure links for project ${project.id}:`, error);
        }
      }
  
      console.log('All documents downloaded successfully.');
    } catch (error) {
      if (error.name === 'AbortError') {
        setError('Directory selection was cancelled');
      } else {
        setError(`Error downloading documents: ${error.message}`);
        console.error('Error:', error);
      }
    } finally {
      setDownloadingDocuments(false);
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