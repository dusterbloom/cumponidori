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
} from '@mui/material';

const ResultsTable = ({
  results,
  page,
  totalPages,
  onPageChange,
  selectedProjects,
  onSelectProject
}) => {
  return (
    <Box sx={{ mb: 4 }}>
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
            {results.map((project) => (
              <TableRow key={project.id}>
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
                  {project.url ? (
                    <Link href={project.url} target="_blank" rel="noopener">
                      View Info
                    </Link>
                  ) : (
                    'N/A'
                  )}
                </TableCell>
                <TableCell>
                  {project.doc_url ? (
                    <Link href={project.doc_url} target="_blank" rel="noopener">
                      View Docs
                    </Link>
                  ) : (
                    'N/A'
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
