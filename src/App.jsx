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

  const downloadDocument = async (doc, projectTitle) => {
    try {
      if (!doc.downloadUrl) {
        throw new Error('Download URL is missing');
      }
  
      // Clean up the project title and filename for safe use in filenames
      const safeProjectTitle = projectTitle.replace(/[/\\?%*:|"<>]/g, '-').substring(0, 50);
      const safeFilename = doc.filename.replace(/[/\\?%*:|"<>]/g, '-');
      
      // Create a more descriptive filename: projectTitle_originalFilename.pdf
      const fullFilename = `${safeProjectTitle}_${safeFilename}`;
      
      console.log(`Attempting to download: ${fullFilename}`);
      
      const response = await fetch(`http://localhost:3001/api/download?url=${encodeURIComponent(doc.downloadUrl)}`);
  
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
  
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = url;
      link.setAttribute('download', fullFilename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 100);
      
      console.log(`Successfully downloaded: ${fullFilename}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error downloading ${doc.filename || 'document'}:`, error);
      throw error;
    }
  };
  
  const handleDownloadDocuments = async () => {
    setDownloadingDocuments(true);
    setError(null);
  
    try {
      // Ask user to select download directory
      let dirHandle;
      try {
        dirHandle = await window.showDirectoryPicker({
          mode: 'readwrite'
        });
      } catch (error) {
        // User cancelled folder selection or browser doesn't support the API
        console.log('Folder selection cancelled or not supported, falling back to default downloads');
      }
  
      for (const projectId of selectedProjects) {
        const project = results.find((p) => p.id === projectId);
        if (!project) continue;
  
        console.log(`Processing project: ${project.title}`);
  
        // If we have a directory handle, create a project subfolder
        let projectDirHandle;
        if (dirHandle) {
          try {
            const safeFolderName = project.title.replace(/[/\\?%*:|"<>]/g, '-').substring(0, 50);
            projectDirHandle = await dirHandle.getDirectoryHandle(safeFolderName, { create: true });
          } catch (error) {
            console.error('Failed to create project folder:', error);
            // Fall back to regular downloads if folder creation fails
            projectDirHandle = null;
          }
        }
  
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
                if (!doc.downloadUrl) {
                  console.error('Document missing download URL:', doc);
                  continue;
                }
                
                if (projectDirHandle) {
                  // If we have a directory handle, save to the selected folder
                  const response = await fetch(`http://localhost:3001/api/download?url=${encodeURIComponent(doc.downloadUrl)}`);
                  if (!response.ok) throw new Error(`HTTP error ${response.status}`);
                  
                  const blob = await response.blob();
                  const safeFilename = doc.filename.replace(/[/\\?%*:|"<>]/g, '-');
                  const fileHandle = await projectDirHandle.getFileHandle(safeFilename, { create: true });
                  const writable = await fileHandle.createWritable();
                  await writable.write(blob);
                  await writable.close();
                  
                  console.log(`Saved ${safeFilename} to selected folder`);
                } else {
                  // Fall back to regular download if no directory handle
                  await downloadDocument(doc, project.title);
                }
                
              } catch (error) {
                console.error(`Failed to download document:`, error);
                // Continue with next document even if one fails
              }
            }
          } catch (error) {
            console.error(`Failed to process procedure ${procedureUrl}:`, error);
          }
        }
      }
  
      console.log('All documents downloaded successfully.');
    } catch (error) {
      setError(`Error downloading documents: ${error.message}`);
      console.error('Error downloading documents:', error);
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