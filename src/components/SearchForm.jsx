import React, { useState } from 'react';
import { TextField, Button, Box } from '@mui/material';

const SearchForm = ({ onSearch }) => {
  const [keyword, setKeyword] = useState('Sardegna');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch(keyword);
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mb: 3 }}>
      <TextField
        fullWidth
        label="Search Keyword"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        margin="normal"
        variant="outlined"
      />
      <Button 
        variant="contained" 
        type="submit"
        sx={{ mt: 2 }}
        fullWidth
      >
        Cerca
      </Button>
    </Box>
  );
};

export default SearchForm;
