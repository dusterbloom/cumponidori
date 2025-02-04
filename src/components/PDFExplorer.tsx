import React, { useState } from "react";
import { Button, Box, Typography, CircularProgress, Alert } from "@mui/material";
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import "pdfjs-dist/build/pdf.worker.entry";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.entry.js",
  import.meta.url
).toString();

interface AnalysisResult {
  filename: string;
  gpsCoordinates: {
    [key: string]: string;
  };
  turbineInfo: {
    vendors: string[];
    models: string[];
  };
  batteryInfo: string[];
  measurements: {
    [key: string]: string;
  };
}

const PDFExplorer: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState<boolean>(false);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const patterns = {
    gps: {
      WGS84_DD: /\b(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)\b/,
      WGS84_DMS: /\b(\d{1,3})[°ºd](\d{1,2})[′'m](\d{1,2}\.?\d*)?[″"s]?[,\s]+(\d{1,3})[°ºd](\d{1,2})[′'m](\d{1,2}\.?\d*)?[″"s]?\b/,
      WGS84_DDM: /\b(\d{1,3})[°ºd](\d{1,2}\.\d+)[′'m][,\s]+(\d{1,3})[°ºd](\d{1,2}\.\d+)[′'m]\b/,
      Gauss_Boaga: /\b(\d{1,6}\.\d+)[,\s]+(\d{1,6}\.\d+)\b/,
      WGS84_Antarctic: /\b(\d{1,6}\.\d+)[,\s]+(\d{1,6}\.\d+)\b/
    },
    turbineVendors: ['Nordex', 'Vestas', 'Siemens Gamesa'],
    turbineModels: [
      'V172-7.2MW', 'N163/7.X', 'N175/6.X', 'V162-6.0MW', 'V162-7.2MW', 'SG170-6,0 MW',
      'V162-6.2MW', 'EV150-6.0 MW-H125', 'V162-5,6 MW', 'N175/6,22', 'N163/5.X',
      'TS118-00', 'V163-4.5MW', 'V52', 'V162-6,0MW'
    ],
    batteryBrands: ['CATL', 'BYD', 'Tesla', 'LG Chem', 'Samsung SDI', 'Panasonic'],
    data: {
      Altitude: /\b(?:altezza|altitude)\b[\s:]*(\d+)\s*m/i,
      Hub_Height: /\b(?:hub|mozzo)\b[\s:]*(\d+)\s*m/i,
      Rotor_Diameter: /\b(?:rotore|diameter)\b[\s:]*(\d+)\s*m/i,
      Blade_Length: /\b(?:lama|pala|blade)\b[\s:]*(\d+)\s*m/i,
      Total_Height: /\b(?:altezza massima|total height)\b[\s:]*(\d+)\s*m/i,
      MWh: /\b(\d+)\s*MWh\b/i,
      MWp: /\b(\d+)\s*MWp\b/i,
      Land_Area: /\b(?:area totale)\b[\s:]*(\d+)\s*ha/i,
      Covered_Surface: /\b(?:superficie coperta)\b[\s:]*(\d+)\s*(?:m²|ha)/i,
      Number_of_Panels: /\b(?:pannelli|moduli)\b[\s:]*(\d+)/i,
      Battery_Modules: /\b(?:moduli batterie)\b[\s:]*(\d+)/i,
      Battery_Containers: /\b(?:containers)\b[\s:]*(\d+)/i
    }
  };

  const analyzePDFContent = async (file: File): Promise<AnalysisResult> => {
    const text = await file.text();

    
    const findings: AnalysisResult = {
      filename: file.name,
      gpsCoordinates: {},
      turbineInfo: {
        vendors: [],
        models: []
      },
      batteryInfo: [],
      measurements: {}
    };

    Object.entries(patterns.gps).forEach(([format, pattern]) => {
      const matches = text.match(pattern);
      if (matches) {
        findings.gpsCoordinates[format] = matches[0];
      }
    });

    patterns.turbineVendors.forEach(vendor => {
      if (text.includes(vendor)) {
        findings.turbineInfo.vendors.push(vendor);
      }
    });

    patterns.turbineModels.forEach(model => {
      if (text.includes(model)) {
        findings.turbineInfo.models.push(model);
      }
    });

    patterns.batteryBrands.forEach(brand => {
      if (text.includes(brand)) {
        findings.batteryInfo.push(brand);
      }
    });

    Object.entries(patterns.data).forEach(([key, pattern]) => {
      const match = text.match(pattern);
      if (match) {
        findings.measurements[key] = match[1];
      }
    });

    return findings;
  };

  const processFiles = async () => {
    setProcessing(true);
    setError(null);
    setResults([]);

    try {
      const analysisResults = await Promise.all(
        files.map(file => analyzePDFContent(file))
      );
      setResults(analysisResults);
    } catch (err: any) {
      console.error("Error processing files:", err);
      setError(`Error processing files: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const downloadCSV = () => {
    if (results.length === 0) return;

    const headers = [
      'Filename',
      'GPS (WGS84_DD)',
      'GPS (WGS84_DMS)',
      'GPS (WGS84_DDM)',
      'GPS (Gauss_Boaga)',
      'GPS (WGS84_Antarctic)',
      'Turbine Vendors',
      'Turbine Models',
      'Battery Brands',
      'Altitude (m)',
      'Hub Height (m)',
      'Rotor Diameter (m)',
      'Blade Length (m)',
      'Total Height (m)',
      'MWh',
      'MWp',
      'Land Area (ha)',
      'Covered Surface',
      'Number of Panels',
      'Battery Modules',
      'Battery Containers'
    ];

    const csvRows = [headers];

    results.forEach(result => {
      const row = [
        result.filename,
        result.gpsCoordinates.WGS84_DD || '',
        result.gpsCoordinates.WGS84_DMS || '',
        result.gpsCoordinates.WGS84_DDM || '',
        result.gpsCoordinates.Gauss_Boaga || '',
        result.gpsCoordinates.WGS84_Antarctic || '',
        result.turbineInfo.vendors.join('; '),
        result.turbineInfo.models.join('; '),
        result.batteryInfo.join('; '),
        result.measurements.Altitude || '',
        result.measurements.Hub_Height || '',
        result.measurements.Rotor_Diameter || '',
        result.measurements.Blade_Length || '',
        result.measurements.Total_Height || '',
        result.measurements.MWh || '',
        result.measurements.MWp || '',
        result.measurements.Land_Area || '',
        result.measurements.Covered_Surface || '',
        result.measurements.Number_of_Panels || '',
        result.measurements.Battery_Modules || '',
        result.measurements.Battery_Containers || ''
      ];
      csvRows.push(row);
    });

    const csvContent = csvRows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pdf_analysis_results.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box sx={{ p: 2, border: "1px dashed gray" }}>

      {/* <input
        type="file"
        multiple
        accept="application/pdf"
        onChange={handleFileChange}
      /> */}
         <Box sx={{ mb: 2 }}>
      <input
        accept="application/pdf"
        id="pdf-upload"
        type="file"
        multiple
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <label htmlFor="pdf-upload">
        <Button variant="contained" component="span" color="primary">
          Carica PDFs
        </Button>
      </label>
    </Box>

    <Box sx={{ mt: 2 }}>
      <Button
        variant="contained"
        onClick={processFiles}
        disabled={files.length === 0 || processing}
        sx={{ mr: 2 }}
      >
        {processing ? "Forroghende..." : "Forroga is PDFs"}
      </Button>
      {results.length > 0 && (
        <Button
          variant="contained"
          onClick={downloadCSV}
        >
          Esporta CSV
        </Button>
      )}
    </Box>

      {processing && (
        <Box sx={{ mt: 2 }}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {results.map((result, index) => (
        <Box key={index} sx={{ mt: 2, p: 2, border: "1px solid #ddd" }}>
          <Typography variant="subtitle1" gutterBottom>
            {result.filename}
          </Typography>
          
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            {Object.entries(result.gpsCoordinates).map(([format, coords]) => (
              coords && (
                <Box key={format}>
                  <Typography variant="body2" color="textSecondary">
                    GPS ({format}):
                  </Typography>
                  <Typography variant="body2" fontFamily="monospace">
                    {coords}
                  </Typography>
                </Box>
              )
            ))}

            {result.turbineInfo.vendors.length > 0 && (
              <Box>
                <Typography variant="body2" color="textSecondary">
                  Marca Turbina:
                </Typography>
                <Typography variant="body2">
                  {result.turbineInfo.vendors.join(', ')}
                </Typography>
              </Box>
            )}

            {result.turbineInfo.models.length > 0 && (
              <Box>
                <Typography variant="body2" color="textSecondary">
                  Modello Turbina:
                </Typography>
                <Typography variant="body2">
                  {result.turbineInfo.models.join(', ')}
                </Typography>
              </Box>
            )}

            {result.batteryInfo.length > 0 && (
              <Box>
                <Typography variant="body2" color="textSecondary">
                  Marca batteria:
                </Typography>
                <Typography variant="body2">
                  {result.batteryInfo.join(', ')}
                </Typography>
              </Box>
            )}
          </Box>

          {Object.entries(result.measurements).length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Misure:
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
                {Object.entries(result.measurements).map(([key, value]) => (
                  <Typography key={key} variant="body2">
                    <strong>{key.replace(/_/g, ' ')}:</strong> {value}
                  </Typography>
                ))}
              </Box>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
};

export default PDFExplorer;