import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Link,
  Pagination,
  Box,
  Checkbox,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';

const ResultsTable = ({ 
  results, 
  page, 
  totalPages, 
  onPageChange, 
  selectedProjects, 
  onSelectProject,
  statusFilter,  // Add this prop
  onStatusFilterChange  // Add this prop
}) => {
  return (
    <Box sx={{ mb: 4 }}>
      <Box sx={{ mb: 2, display: 'flex', gap: 2 }}>
        <FormControl sx={{ minWidth: 300 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={statusFilter}
            label="Status"
            onChange={(e) => onStatusFilterChange(e.target.value)}
          >
            <MenuItem value="all">All</MenuItem>
            {VALID_STATUSES.map((status) => (
              <MenuItem key={status} value={status}>
                {status}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <TableContainer component={Paper} sx={{ mb: 2 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Select</TableCell>
              <TableCell>Title</TableCell>
              <TableCell>Proponent</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Info</TableCell>
              <TableCell>Documentation</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {results
              .filter(project => statusFilter === 'all' || project.status === statusFilter)
              .map((project) => (
                <TableRow key={project.id || Math.random()}>
                  <TableCell>
                    <Checkbox
                      checked={selectedProjects.includes(project.id)}
                      onChange={(e) => onSelectProject(project.id, e.target.checked)}
                    />
                  </TableCell>
                  <TableCell>{project.title}</TableCell>
                  <TableCell>{project.proponent}</TableCell>
                  <TableCell>{project.status}</TableCell>
                  <TableCell>
                    <Link href={project.url} target="_blank" rel="noopener">
                      View Info
                    </Link>
                  </TableCell>
                  <TableCell>
                    {project.doc_url && (
                      <Link href={project.doc_url} target="_blank" rel="noopener">
                        View Docs
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Pagination 
            count={totalPages} 
            page={page} 
            onChange={(e, value) => onPageChange(value)}
            color="primary"
            size="large"
          />
        </Box>
      )}
    </Box>
  );
};

// Add VALID_STATUSES constant
const VALID_STATUSES = [
  'Valutazione preliminare',
  'Verifica di Ottemperanza',
  'Valutazione Impatto Ambientale',
  'Valutazione Impatto Ambientale (PNIEC-PNRR)',
  'Verifica di Assoggettabilità a VIA',
  'Provvedimento Unico in materia Ambientale (PNIEC-PNRR)',
  'Definizione contenuti SIA (PNIEC-PNRR)'
];

export default ResultsTable;