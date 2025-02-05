import * as React from 'react';
import {
  Box,
  Button,
  Typography,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Grid,
  Card,
  CardContent,
  IconButton,
  Tooltip,
  Chip
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Download as DownloadIcon,
  Article as ArticleIcon
} from '@mui/icons-material';

interface AnalysisResult {
  entities: Array<{
    text: string;
    label: string;
    start: number;
    end: number;
    context: string;  // Added context field
  }>;
  matches: Array<{
    pattern: string;
    text: string;
    start: number;
    end: number;
    context: string;  // Added context field
  }>;
  tables: Array<{
    page: number;
    data: string[][];
    context?: string;  // Optional context for tables
  }>;
}

interface PDFFile {
  file: File;
  result?: AnalysisResult;
  analyzing: boolean;
  error?: string;
}

const PDFExplorer: React.FC = () => {
  const [pdfFiles, setPdfFiles] = React.useState<PDFFile[]>([]);
  const [globalError, setGlobalError] = React.useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles = Array.from(event.target.files).map(file => ({
        file,
        analyzing: false
      }));
      setPdfFiles(prev => [...prev, ...newFiles]);
      setGlobalError(null);
    }
  };

  const analyzePDF = async (pdfFile: PDFFile, index: number) => {
    if (pdfFile.analyzing) return;
  
    setPdfFiles(prev => prev.map((f, i) => 
      i === index ? { ...f, analyzing: true, error: undefined } : f
    ));
  
    try {
      const reader = new FileReader();
      
      const base64Content = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const content = result.split(',')[1];
          resolve(content);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(pdfFile.file);
      });
  
      const response = await fetch('/api/analyze-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: base64Content })
      });
  
      if (!response.ok) {
        throw new Error("Analysis failed: \${response.status} \${response.statusText}");
      }
  
      const data = await response.json();
  
      // Ensure the response has the correct structure
      const analysisResult: AnalysisResult = {
        entities: Array.isArray(data.entities) ? data.entities : [],
        matches: Array.isArray(data.matches) ? data.matches : [],
        tables: Array.isArray(data.tables) ? data.tables : []
      };
      
      setPdfFiles(prev => prev.map((f, i) => 
        i === index ? { 
          ...f, 
          analyzing: false, 
          result: analysisResult,
          error: undefined
        } : f
      ));
    } catch (error) {
      console.error('PDF Analysis error:', error);
      setPdfFiles(prev => prev.map((f, i) => 
        i === index ? { 
          ...f, 
          analyzing: false, 
          error: error instanceof Error ? error.message : 'Analysis failed' 
        } : f
      ));
    }
  };

  const testConnection = async () => {
    try {
      console.log('Testing server connection...');
      const response = await fetch('/api/test');
      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }
      const data = await response.json();
      console.log('Server test response:', data);
      alert(`Server response: ${data.message}`);
    } catch (error) {
      console.error('Server test failed:', error);
      alert(`Server test failed: ${error.message}`);
    }
  };


  const handleAnalyzeAll = async () => {
    setGlobalError(null);
    const analysisPromises = pdfFiles.map((file, index) => analyzePDF(file, index));
    try {
      await Promise.all(analysisPromises);
    } catch (error) {
      setGlobalError('Some files failed to analyze. Check individual file status for details.');
    }
  };

  const handleRemoveFile = (index: number) => {
    setPdfFiles(prev => prev.filter((_, i) => i !== index));
  };


  const handleDownloadCSV = () => {
    const results = pdfFiles
      .filter(f => f.result)
      .map(f => {
        // Group entities by type with cleaner formatting
        const formatEntities = (entities: any[], type: string) => 
          entities
            .filter(e => e.label === type)
            .map(e => `${e.text} | ${e.context || ''}`)
            .join(';;');
  
        // Format matches with cleaner structure
        const formatMatches = (matches: any[], pattern: string) =>
          matches
            .filter(m => m.pattern === pattern)
            .map(m => `${m.text} | ${m.context || ''}`)
            .join(';;');
  
        // Format tables more cleanly
        const formatTables = (tables: any[]) =>
          tables.map((table, idx) => {
            const headerRow = table.data[0]?.join(' | ');
            const dataRows = table.data.slice(1, 3).map(row => row.join(' | '));
            return `Table ${idx + 1} (Page ${table.page})::${headerRow}::${dataRows.join('::')}`;
          }).join('||');
  
        return {
          "Filename": f.file.name,
          "File_Size_KB": Math.round(f.file.size / 1024).toString(),
          "Analysis_Timestamp": new Date().toISOString(),
          "Location_Entities": formatEntities(f.result?.entities ?? [], 'LOC'),
          "Organization_Entities": formatEntities(f.result?.entities ?? [], 'ORG'),
          "Geographic_Entities": formatEntities(f.result?.entities ?? [], 'GPE'),
          "Environmental_Matches": formatMatches(f.result?.matches ?? [], 'ENVIRONMENTAL'),
          "Turbine_Specifications": formatMatches(f.result?.matches ?? [], 'TURBINE'),
          "Cadastral_References": formatMatches(f.result?.matches ?? [], 'CADASTRAL'),
          "Number_of_Tables": (f.result?.tables ?? []).length.toString(),
          "Tables_Detail": formatTables(f.result?.tables ?? [])
        };
      });
  
    // Ensure consistent column headers and handle empty results
    const headers = [
      "Filename",
      "File_Size_KB",
      "Analysis_Timestamp",
      "Location_Entities",
      "Organization_Entities",
      "Geographic_Entities",
      "Environmental_Matches",
      "Turbine_Specifications",
      "Cadastral_References",
      "Number_of_Tables",
      "Tables_Detail"
    ];
  
    // Create CSV content with consistent typing
    const csvContent = [
      headers.join(','),
      ...results.map(row => 
        headers.map(header => {
          const value = row[header] || '';
          // Ensure all values are treated as strings
          return `"${value.toString().replace(/"/g, '""')}"`;
        }).join(',')
      )
    ].join('\n');
  
    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.setAttribute('download', `pdf_analysis_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Box sx={{ p: 2 }}>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={6}>
              <Typography variant="h5" component="h1" gutterBottom>
                PDF Explorer
              </Typography>
            </Grid>
            <Grid item xs={12} md={6} sx={{ textAlign: 'right' }}>
              <input
                accept="application/pdf"
                style={{ display: 'none' }}
                id="pdf-upload"
                multiple
                type="file"
                onChange={handleFileChange}
              />
              <label htmlFor="pdf-upload">
                <Button
                  variant="contained"
                  component="span"
                  startIcon={<UploadIcon />}
                  sx={{ mr: 1 }}
                >
                  Upload PDFs
                </Button>
              </label>
              {pdfFiles.length > 0 && (
                <>
                  <Button
                    variant="contained"
                    onClick={handleAnalyzeAll}
                    startIcon={<SearchIcon />}
                    sx={{ mr: 1 }}
                  >
                    Analyze All
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleDownloadCSV}
                    startIcon={<DownloadIcon />}
                    disabled={!pdfFiles.some(f => f.result)}
                  >
                    Export CSV
                  </Button>
                </>
              )}
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {globalError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {globalError}
        </Alert>
      )}

      {pdfFiles.map((pdfFile, index) => (
        <Card key={index} sx={{ mb: 2 }}>
          <CardContent>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs>
                <Typography variant="h6" component="h2">
                  <ArticleIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                  {pdfFile.file.name}
                </Typography>
              </Grid>
              <Grid item>
                {pdfFile.analyzing ? (
                  <CircularProgress size={24} />
                ) : (
                  <>
                    <Tooltip title="Analyze PDF">
                      <IconButton 
                        onClick={() => analyzePDF(pdfFile, index)}
                        disabled={pdfFile.analyzing}
                      >
                        <SearchIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Remove PDF">
                      <IconButton 
                        onClick={() => handleRemoveFile(index)}
                        disabled={pdfFile.analyzing}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
              </Grid>
            </Grid>

            {pdfFile.error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {pdfFile.error}
              </Alert>
            )}

            {pdfFile.result && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Analysis Results
                </Typography>

                {/* Entities Table */}
                {pdfFile.result.entities.length > 0 && (
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Named Entities
                    </Typography>
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Text</TableCell>
                            <TableCell>Type</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {pdfFile.result.entities.map((entity, i) => (
                            <TableRow key={i}>
                              <TableCell>{entity.text}</TableCell>
                              <TableCell>
                                <Chip 
                                  label={entity.label} 
                                  size="small"
                                  color={
                                    entity.label === 'LOC' ? 'primary' :
                                    entity.label === 'ORG' ? 'secondary' : 'default'
                                  }
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                )}

                {/* Pattern Matches Table */}
                {pdfFile.result.matches.length > 0 && (
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Pattern Matches
                    </Typography>
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Pattern</TableCell>
                            <TableCell>Text</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {pdfFile.result.matches.map((match, i) => (
                            <TableRow key={i}>
                              <TableCell>
                                <Chip 
                                  label={match.pattern} 
                                  size="small"
                                  variant="outlined"
                                />
                              </TableCell>
                              <TableCell>{match.text}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                )}

                {/* Tables */}
                {pdfFile.result.tables.length > 0 && (
                  <Box>
                    <Typography variant="subtitle2" gutterBottom>
                      Extracted Tables ({pdfFile.result.tables.length})
                    </Typography>
                    {pdfFile.result.tables.map((table, tableIndex) => (
                      <Box key={tableIndex} sx={{ mb: 2 }}>
                        <Typography variant="body2" gutterBottom>
                          Table from page {table.page}
                        </Typography>
                        <TableContainer component={Paper} variant="outlined">
                          <Table size="small">
                            <TableBody>
                              {table.data.map((row, rowIndex) => (
                                <TableRow key={rowIndex}>
                                  {row.map((cell, cellIndex) => (
                                    <TableCell key={cellIndex}>{cell}</TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            )}
          </CardContent>
        </Card>
      ))}

      {pdfFiles.length === 0 && (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body1" color="textSecondary">
            Upload PDF files to begin analysis
          </Typography>
        </Paper>
      )}

<Button
  variant="contained"
  onClick={testConnection}
  sx={{ mr: 1 }}
>
  Test Connection
</Button>
    </Box>
  );
};

export default PDFExplorer;