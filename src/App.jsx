import React, { useState, useEffect } from 'react';
import { Container, Typography, Box, Alert, CircularProgress } from '@mui/material';
import SearchForm from './components/SearchForm';
import ResultsTable from './components/ResultsTable';
import { searchProjects } from './api';

const App = () => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [currentKeyword, setCurrentKeyword] = useState('');

  const handleSearch = async (keyword, pageNum = 1) => {
    if (!keyword.trim()) {
      setError('Please enter a search term');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const data = await searchProjects(keyword, pageNum);
      setResults(data.projects || []);
      setTotalPages(data.totalPages || 1);
      setPage(data.currentPage || 1);
      setCurrentKeyword(keyword);
    } catch (err) {
      console.error('Search error:', err);
      setError(err.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newPage) => {
    if (currentKeyword) {
      handleSearch(currentKeyword, newPage);
    }
  };

  useEffect(() => {
    handleSearch('Sardegna', 1);
  }, []);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        Project Search
      </Typography>
      
      <SearchForm onSearch={handleSearch} />
      
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
        <ResultsTable 
          results={results} 
          page={page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      )}
      
      {!loading && !error && results.length === 0 && (
        <Alert severity="info">
          No results found. Try a different search term.
        </Alert>
      )}
    </Container>
  );
};

export default App;
