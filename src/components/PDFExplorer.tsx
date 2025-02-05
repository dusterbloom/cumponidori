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
  }>;
  matches: Array<{
    pattern: string;
    text: string;
    start: number;
    end: number;
  }>;
  tables: Array<{
    page: number;
    data: string[][];
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
      
      const result = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(pdfFile.file);
      });

      const base64Content = result.split(',')[1];
      
      const response = await fetch('http://localhost:3001/api/analyze-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: base64Content }),
      });

      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.statusText}`);
      }

      const analysisResult = await response.json();
      
      setPdfFiles(prev => prev.map((f, i) => 
        i === index ? { 
          ...f, 
          analyzing: false, 
          result: analysisResult,
          error: undefined
        } : f
      ));
    } catch (error) {
      setPdfFiles(prev => prev.map((f, i) => 
        i === index ? { 
          ...f, 
          analyzing: false, 
          error: error instanceof Error ? error.message : 'Analysis failed' 
        } : f
      ));
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
    const results = pdfFiles.filter(f => f.result).map(f => ({
      filename: f.file.name,
      entities: f.result?.entities.map(e => `${e.text} (${e.label})`).join('; '),
      matches: f.result?.matches.map(m => `${m.pattern}: ${m.text}`).join('; '),
      tables: f.result?.tables.length || 0
    }));

    const csvContent = [
      ['Filename', 'Entities', 'Pattern Matches', 'Number of Tables'],
      ...results.map(r => [r.filename, r.entities, r.matches, r.tables.toString()])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'pdf_analysis_results.csv');
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
    </Box>
  );
};

export default PDFExplorer;