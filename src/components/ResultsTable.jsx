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
  Box
} from '@mui/material';

const ResultsTable = ({ results, page, totalPages, onPageChange }) => {
  return (
    <Box sx={{ mb: 4 }}>
      <TableContainer component={Paper} sx={{ mb: 2 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Title</TableCell>
              <TableCell>Proponent</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Info</TableCell>
              <TableCell>Documentation</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {results.map((project) => (
              <TableRow key={project.id || Math.random()}>
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

export default ResultsTable;
