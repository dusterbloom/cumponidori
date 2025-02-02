import React, { useState } from "react";
import { Button, Box, Typography, CircularProgress, Alert } from "@mui/material";
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import "pdfjs-dist/build/pdf.worker.entry";

// Configure the PDF.js worker:
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.entry.js",
  import.meta.url
).toString();

// Define an interface for coordinate pairs.
interface Coordinate {
  lat: number;
  lng: number;
}

const PDFExplorer: React.FC = () => {
  // Set the files state as an array of File objects.
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState<boolean>(false);
  // Define coords as an array of Coordinate objects.
  const [coords, setCoords] = useState<Coordinate[]>([]);
  // Error state can be a string or null.
  const [error, setError] = useState<string | null>(null);

  // Handle file input changes.
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  // Simple regex extractor for decimal degree coordinates.
  const extractCoordinatesFromText = (text: string): Coordinate[] => {
    // Matches two decimal numbers (optionally negative) separated by comma or whitespace.
    const regex = /(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/g;
    let matches: RegExpExecArray | null;
    const found: Coordinate[] = [];
    while ((matches = regex.exec(text)) !== null) {
      const lat = parseFloat(matches[1]);
      const lng = parseFloat(matches[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        found.push({ lat, lng });
      }
    }
    return found;
  };

  // Process all selected PDFs: for each file, load with PDF.js, extract text, then extract coordinate pairs.
  const processFiles = async () => {
    setProcessing(true);
    setError(null);
    let allCoords: Coordinate[] = [];

    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          // Note: 'textContent.items' is of type any[] since PDF.js doesn't provide strict types.
          const pageText = textContent.items.map((item: any) => item.str).join(" ");
          const extracted = extractCoordinatesFromText(pageText);
          allCoords = allCoords.concat(extracted);
        }
      } catch (err: any) {
        console.error("Error processing file", file.name, err);
        setError(`Error processing file ${file.name}: ${err.message}`);
      }
    }

    setCoords(allCoords);
    setProcessing(false);
  };

  // Generate a KML string from the extracted coordinates and trigger a download.
  const exportToKML = () => {
    let kml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    kml += `<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n`;
    coords.forEach((coord, index) => {
      kml += `<Placemark>\n`;
      kml += `<name>Location ${index + 1}</name>\n`;
      kml += `<Point>\n`;
      // KML expects coordinates as "longitude,latitude,altitude"
      kml += `<coordinates>${coord.lng},${coord.lat},0</coordinates>\n`;
      kml += `</Point>\n</Placemark>\n`;
    });
    kml += `</Document>\n</kml>`;

    const blob = new Blob([kml], {
      type: "application/vnd.google-earth.kml+xml",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "extracted_locations.kml";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box sx={{ p: 2, border: "1px dashed gray" }}>
      <Typography variant="h6" gutterBottom>
        EsploraPDF
      </Typography>
      <input
        type="file"
        multiple
        accept="application/pdf"
        onChange={handleFileChange}
      />
      <Box sx={{ mt: 2 }}>
        <Button
          variant="contained"
          onClick={processFiles}
          disabled={files.length === 0 || processing}
        >
          {processing ? "Processing..." : "Process PDFs"}
        </Button>
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
      {coords.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography>
            Extracted {coords.length} coordinate pair{coords.length > 1 ? "s" : ""}.
          </Typography>
          <Button variant="contained" onClick={exportToKML} sx={{ mt: 1 }}>
            Export to Google Earth (KML)
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default PDFExplorer;
