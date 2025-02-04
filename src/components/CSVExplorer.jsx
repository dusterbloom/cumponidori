import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import {
  Box,
  Button,
  TextField,
  Checkbox,
  FormControlLabel,
  Typography,
  CircularProgress,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { blue } from '@mui/material/colors';

const CSVExplorer = () => {
  // CSV data (each row is an object) and other states
  const [csvData, setCsvData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Filter states (you can adjust the keys to match your CSV headers)
  const [filters, setFilters] = useState({
    pdfFilename: '',
    pageNumber: '',
    text: '',
  });
  // DataGrid row selection (store row IDs)
  const [selectedRows, setSelectedRows] = useState([]);
  // Keep track of which columns are visible – initially, once the CSV is loaded,
  // we initialize an object keyed by the CSV header names.
  const [visibleColumns, setVisibleColumns] = useState({});
  // For export dialog
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFilename, setExportFilename] = useState('export.csv');

  // --- CSV Upload and Parsing ---
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setError('');

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      worker: true, // offload parsing to a web worker for large files
      complete: (results) => {
        setCsvData(results.data);
        // Automatically enable all columns based on CSV headers
        if (results.data.length > 0) {
          const headers = Object.keys(results.data[0]);
          const initialVisible = {};
          headers.forEach((header) => {
            initialVisible[header] = true;
          });
          setVisibleColumns(initialVisible);
        }
        setLoading(false);
      },
      error: (err) => {
        setError(err.message);
        setLoading(false);
      },
    });
  };

  // --- Filtering ---
  // Compute filtered data based on three filters:
  //   • PDF filename (assumed to be in a column called "PDF filename")
  //   • Page number (assumed to be in "Page number")
  //   • A free-text search across all fields
  const filteredData = useMemo(() => {
    if (!csvData.length) return [];
    return csvData.filter((row) => {
      const matchPdf =
        filters.pdfFilename.trim() === '' ||
        (row['PDF'] &&
          row['PDF']
            .toLowerCase()
            .includes(filters.pdfFilename.toLowerCase()));
      const matchPage =
        filters.pageNumber.trim() === '' ||
        (row['N. pagina'] &&
          row['N. pagina'].toString().includes(filters.pageNumber));
      const matchText =
        filters.text.trim() === '' ||
        Object.values(row).some((val) =>
          String(val).toLowerCase().includes(filters.text.toLowerCase())
        );
      return matchPdf && matchPage && matchText;
    });
  }, [csvData, filters]);

  // --- DataGrid Columns ---
  // We generate columns dynamically from the CSV header keys,
  // but only include columns that are currently toggled as visible.
  const columns = useMemo(() => {
    if (!csvData.length) return [];
    const headers = Object.keys(csvData[0]).filter((key) => visibleColumns[key]);
    return headers.map((header) => ({
      field: header,
      headerName: header,
      flex: 1,
      // Render cell content with highlighted matches for the free-text filter.
      renderCell: (params) => {
        const cellValue = params.value ? params.value.toString() : '';
        if (filters.text) {
          // Create a regular expression to match the filter text (case-insensitive)
          const regex = new RegExp(`(${filters.text})`, 'gi');
          // Split the cell text by the search term and wrap matches in a <mark>
          const parts = cellValue.split(regex);
          return (
            <span>
              {parts.map((part, index) =>
                regex.test(part) ? (
                  <mark key={index} style={{ backgroundColor: blue[100] }}>
                    {part}
                  </mark>
                ) : (
                  part
                )
              )}
            </span>
          );
        }
        return cellValue;
      },
    }));
  }, [csvData, visibleColumns, filters.text]);

  // --- Handlers for UI Inputs ---
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleToggleColumn = (column) => {
    setVisibleColumns((prev) => ({ ...prev, [column]: !prev[column] }));
  };

  // --- Export CSV ---
  const handleExport = () => {
    // Determine the data to export: if any rows are selected, export only those.
    const dataToExport =
      selectedRows.length > 0
        ? filteredData.filter((_, index) => selectedRows.includes(index))
        : filteredData;

    // Build export data by keeping only the visible columns.
    const exportData = dataToExport.map((row) => {
      const newRow = {};
      Object.keys(row).forEach((key) => {
        if (visibleColumns[key]) {
          newRow[key] = row[key];
        }
      });
      return newRow;
    });

    // Use Papa.unparse to generate CSV string.
    const csvString = Papa.unparse(exportData);

    // Create a Blob and trigger the download.
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', exportFilename);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportDialogOpen(false);
  };

  return (
    <Box sx={{ p: 2 }}>


      {/* CSV Upload */}
      <Box sx={{ mb: 2 }}>
        <input
          accept=".csv"
          id="csv-upload"
          type="file"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
        <label htmlFor="csv-upload">
          <Button variant="contained" component="span" color="primary">
            Carica CSV
          </Button>
        </label>
      </Box>

      {loading && <CircularProgress />}
      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}

      {/* Show the explorer only if CSV data has been loaded */}
      {csvData.length > 0 && (
        <>
          {/* Filters */}
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              mb: 2,
              flexWrap: 'wrap',
            }}
          >
            <TextField
              label="Filtra per PDF"
              name="pdfFilename"
              value={filters.pdfFilename}
              onChange={handleFilterChange}
              variant="outlined"
              size="small"
            />
            <TextField
              label="Filtra per numero pagina"
              name="pageNumber"
              value={filters.pageNumber}
              onChange={handleFilterChange}
              variant="outlined"
              size="small"
            />
            <TextField
              label="Ricerca testuale"
              name="text"
              value={filters.text}
              onChange={handleFilterChange}
              variant="outlined"
              size="small"
            />
          </Box>

          {/* Column Toggle Controls */}
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              mb: 2,
              flexWrap: 'wrap',
            }}
          >
            {Object.keys(csvData[0]).map((col) => (
              <FormControlLabel
                key={col}
                control={
                  <Checkbox
                    size="small"
                    checked={visibleColumns[col] || false}
                    onChange={() => handleToggleColumn(col)}
                  />
                }
                label={col}
              />
            ))}
          </Box>

          {/* DataGrid Table */}
          <Paper sx={{ height: 500, width: '100%', mb: 2 }}>
            <DataGrid
              // We assign each row a unique ID based on its index.
              rows={filteredData.map((row, index) => ({ id: index, ...row }))}
              columns={columns}
              pageSize={50}
              rowsPerPageOptions={[50, 100, 500]}
              checkboxSelection
              disableSelectionOnClick
              onSelectionModelChange={(newSelection) =>
                // newSelection is an array of row IDs (here, the index in filteredData)
                setSelectedRows(newSelection)
              }
            />
          </Paper>

          {/* Status Bar */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2">
              Totale Righe: {csvData.length} | Righe filtrate: {filteredData.length} |{' '}
              Righe selezionate: {selectedRows.length}
            </Typography>
          </Box>

          {/* Export CSV Button */}
          <Button
            variant="contained"
            color="secondary"
            onClick={() => setExportDialogOpen(true)}
          >
            Esporta CSV
          </Button>

          {/* Export Dialog */}
          <Dialog
            open={exportDialogOpen}
            onClose={() => setExportDialogOpen(false)}
          >
            <DialogTitle>Esporta CSV</DialogTitle>
            <DialogContent>
              <TextField
                autoFocus
                margin="dense"
                label="Filename"
                fullWidth
                variant="outlined"
                value={exportFilename}
                onChange={(e) => setExportFilename(e.target.value)}
              />
              <Typography variant="body2" sx={{ mt: 1 }}>
                Esporta {selectedRows.length > 0 ? 'selected' : 'all filtered'} righe
                con colonne visibili.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setExportDialogOpen(false)}>Annulla</Button>
              <Button onClick={handleExport} variant="contained" color="primary">
                Esporta
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}
    </Box>
  );
};

export default CSVExplorer;
