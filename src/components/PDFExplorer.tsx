import React, { useState } from "react";
import { Button, Box, Typography, CircularProgress, Alert } from "@mui/material";
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import "pdfjs-dist/build/pdf.worker.entry";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.entry.js",
  import.meta.url
).toString();

interface InstallationDetails {
  name: string;
  type: string;
  capacity: string;
  area: string;
  municipality: string;
  province: string;
  developer: string;
}

interface Coordinate {
  lat: number;
  lng: number;
  details: InstallationDetails;
}

const PDFExplorer: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState<boolean>(false);
  const [coords, setCoords] = useState<Coordinate[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const extractItalianProjectDetails = (text: string): InstallationDetails => {
    // Common Italian project naming patterns
    const nameRegex = /Impianto (?:fotovoltaico|eolico|agrivoltaico) ["']([^"']+)["']/i;
    const capacityRegex = /(\d+(?:[,.]\d+)?)\s*(?:MW|MWp|kW|kWp|GW)/i;
    const areaRegex = /(\d+(?:[,.]\d+)?)\s*(?:ettari|ha|m²|metri quadrati|mq)/i;
    const municipalityRegex = /(?:Comune|località) di ([A-Za-zàèéìòù\s]+)/i;
    const provinceRegex = /(?:Provincia|Città Metropolitana) (?:di|del) ([A-Za-zàèéìòù\s]+)/i;
    const developerRegex = /([A-Za-zàèéìòù\s.]+(?:S\.p\.A\.|S\.r\.l\.|S\.r\.l|SPA|SRL))/i;
    const typeRegex = /(?:impianto|parco|centrale) (fotovoltaico|eolico|solare|agrivoltaico)/i;

    return {
      name: (nameRegex.exec(text)?.[1] || "").trim(),
      type: (typeRegex.exec(text)?.[1] || "").trim(),
      capacity: (capacityRegex.exec(text)?.[1] || "").trim(),
      area: (areaRegex.exec(text)?.[1] || "").trim(),
      municipality: (municipalityRegex.exec(text)?.[1] || "").trim(),
      province: (provinceRegex.exec(text)?.[1] || "").trim(),
      developer: (developerRegex.exec(text)?.[1] || "").trim()
    };
  };

  const extractCoordinatesFromText = (text: string): Coordinate[] => {
    const coordinates: Coordinate[] = [];
    
    // Match both DMS and decimal formats with Italian formatting
    const dmsRegex = /(\d+)°(\d+)'(\d+(?:[,.]\d+)?)[\"']?\s*([NSns])[,\s]+(\d+)°(\d+)'(\d+(?:[,.]\d+)?)[\"']?\s*([EWew])/g;
    const decimalRegex = /(-?\d{1,3}[,.]\d+)[,\s]+(-?\d{1,3}[,.]\d+)/g;
    
    const projectDetails = extractItalianProjectDetails(text);

    // Process DMS format
    let match;
    while ((match = dmsRegex.exec(text)) !== null) {
      const lat = convertDMSToDecimal(
        parseInt(match[1]),
        parseInt(match[2]),
        parseFloat(match[3].replace(',', '.')),
        match[4].toUpperCase()
      );
      const lng = convertDMSToDecimal(
        parseInt(match[5]),
        parseInt(match[6]),
        parseFloat(match[7].replace(',', '.')),
        match[8].toUpperCase()
      );

      if (isValidCoordinate(lat, lng)) {
        coordinates.push({ lat, lng, details: projectDetails });
      }
    }

    // Process decimal format
    while ((match = decimalRegex.exec(text)) !== null) {
      const lat = parseFloat(match[1].replace(',', '.'));
      const lng = parseFloat(match[2].replace(',', '.'));

      if (isValidCoordinate(lat, lng)) {
        coordinates.push({ lat, lng, details: projectDetails });
      }
    }

    return coordinates;
  };

  const isValidCoordinate = (lat: number, lng: number): boolean => {
    // Adjusted for Italian territory bounds
    return (
      !isNaN(lat) &&
      !isNaN(lng) &&
      lat >= 35 && 
      lat <= 48 && 
      lng >= 6 && 
      lng <= 19 
    );
  };

  const convertDMSToDecimal = (
    degrees: number,
    minutes: number,
    seconds: number,
    direction: string
  ): number => {
    let decimal = degrees + (minutes / 60) + (seconds / 3600);
    if (direction === 'S' || direction === 'W') {
      decimal = -decimal;
    }
    return decimal;
  };

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
          const pageText = textContent.items.map((item: any) => item.str).join(" ");
          const extracted = extractCoordinatesFromText(pageText);
          allCoords = allCoords.concat(extracted);
        }
      } catch (err: any) {
        console.error("Errore nell'elaborazione del file", file.name, err);
        setError(`Errore nell'elaborazione del file ${file.name}: ${err.message}`);
      }
    }

    setCoords(allCoords);
    setProcessing(false);
  };

  const exportToKML = () => {
    let kml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    kml += `<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n`;
    
    coords.forEach((coord, index) => {
      kml += `<Placemark>\n`;
      kml += `<name>${coord.details.name || `Impianto ${index + 1}`}</name>\n`;
      kml += `<description>`;
      kml += `<![CDATA[`;
      kml += `Tipo: ${coord.details.type}\n`;
      kml += `Potenza: ${coord.details.capacity}\n`;
      kml += `Area: ${coord.details.area}\n`;
      kml += `Comune: ${coord.details.municipality}\n`;
      kml += `Provincia: ${coord.details.province}\n`;
      kml += `Sviluppatore: ${coord.details.developer}\n`;
      kml += `]]>`;
      kml += `</description>\n`;
      kml += `<Point>\n`;
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
    a.download = "impianti_rinnovabili.kml";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box sx={{ p: 2, border: "1px dashed gray" }}>
      <Typography variant="h6" gutterBottom>
        Analizzatore Documenti Rinnovabili
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
          {processing ? "Elaborazione in corso..." : "Elabora PDF"}
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
            Estratte {coords.length} coordinate{coords.length > 1 ? "" : ""}.
          </Typography>
          <Button variant="contained" onClick={exportToKML} sx={{ mt: 1 }}>
            Esporta KML per Google Earth
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default PDFExplorer;


// import React, { useState } from "react";
// import { Button, Box, Typography, CircularProgress, Alert } from "@mui/material";
// import * as pdfjsLib from "pdfjs-dist/build/pdf";
// import "pdfjs-dist/build/pdf.worker.entry";

// pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
//   "pdfjs-dist/build/pdf.worker.entry.js",
//   import.meta.url
// ).toString();

// interface InstallationDetails {
//   name: string;
//   type: string;
//   capacity: string;
//   area: string;
//   municipality: string;
//   province: string;
//   developer: string;
// }

// interface Coordinate {
//   lat: number;
//   lng: number;
//   details: InstallationDetails;
// }

// const PDFExplorer: React.FC = () => {
//   const [files, setFiles] = useState<File[]>([]);
//   const [processing, setProcessing] = useState<boolean>(false);
//   const [coords, setCoords] = useState<Coordinate[]>([]);
//   const [error, setError] = useState<string | null>(null);

//   const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     if (e.target.files) {
//       setFiles(Array.from(e.target.files));
//     }
//   };


//   // Project detail regex patterns
// const nameRegex = /Nome(?:\s+dell)?(?:')?(?:\s+impianto)?:\s*([^\n]+)/i;
// const typeRegex = /Tipo(?:\s+di)?(?:\s+impianto)?:\s*([^\n]+)/i;
// const capacityRegex = /Potenza(?:\s+nominale)?:\s*([^\n]+)/i;
// const areaRegex = /(?:Superficie|Area)(?:\s+occupata)?:\s*([^\n]+)/i;
// const municipalityRegex = /Comune:\s*([^\n]+)/i;
// const provinceRegex = /Provincia:\s*([^\n]+)/i;
// const developerRegex = /(?:Proponente|Sviluppatore|Società):\s*([^\n]+)/i;

// // Coordinate regex patterns
// const dmsRegex = /(\d{1,2})\D+(\d{1,2})\D+(\d{1,2}(?:[.,]\d+)?)\D*([NS])\D*(\d{1,2})\D+(\d{1,2})\D+(\d{1,2}(?:[.,]\d+)?)\D*([EW])/gi;
// const decimalRegex = /(\d{1,2}[.,]\d+)\D+(\d{1,2}[.,]\d+)/g;

//   const extractItalianProjectDetails = (text: string): InstallationDetails => {
//     console.log('Analyzing text for project details:', text.substring(0, 200) + '...');
//     const details = {
//       name: (nameRegex.exec(text)?.[1] || "").trim(),
//       type: (typeRegex.exec(text)?.[1] || "").trim(),
//       capacity: (capacityRegex.exec(text)?.[1] || "").trim(),
//       area: (areaRegex.exec(text)?.[1] || "").trim(),
//       municipality: (municipalityRegex.exec(text)?.[1] || "").trim(),
//       province: (provinceRegex.exec(text)?.[1] || "").trim(),
//       developer: (developerRegex.exec(text)?.[1] || "").trim()
//     };
//     console.log('Extracted project details:', details);
//     return details;
//   };

//   const extractCoordinatesFromText = (text: string): Coordinate[] => {
//     console.log('Starting coordinate extraction from text');
//     const coordinates: Coordinate[] = [];
    
//     // Process DMS format
//     let dmsMatch;
//     while ((dmsMatch = dmsRegex.exec(text)) !== null) {
//       console.log('Found DMS format match:', dmsMatch[0]);
//       const lat = convertDMSToDecimal(
//         parseInt(dmsMatch[1]),
//         parseInt(dmsMatch[2]),
//         parseFloat(dmsMatch[3].replace(',', '.')),
//         dmsMatch[4].toUpperCase()
//       );
//       const lng = convertDMSToDecimal(
//         parseInt(dmsMatch[5]),
//         parseInt(dmsMatch[6]),
//         parseFloat(dmsMatch[7].replace(',', '.')),
//         dmsMatch[8].toUpperCase()
//       );

//       console.log('Converted DMS to decimal:', { lat, lng });
//       if (isValidCoordinate(lat, lng)) {
//         coordinates.push({ lat, lng, details: extractItalianProjectDetails(text) });
//       } else {
//         console.log('Invalid coordinate pair (outside Italy):', { lat, lng });
//       }
//     }

//     // Process decimal format
//     let decimalMatch;
//     while ((decimalMatch = decimalRegex.exec(text)) !== null) {
//       console.log('Found decimal format match:', decimalMatch[0]);
//       const lat = parseFloat(decimalMatch[1].replace(',', '.'));
//       const lng = parseFloat(decimalMatch[2].replace(',', '.'));

//       console.log('Parsed decimal coordinates:', { lat, lng });
//       if (isValidCoordinate(lat, lng)) {
//         coordinates.push({ lat, lng, details: extractItalianProjectDetails(text) });
//       } else {
//         console.log('Invalid coordinate pair (outside Italy):', { lat, lng });
//       }
//     }

//     console.log(`Extraction complete. Found ${coordinates.length} valid coordinates`);
//     return coordinates;
//   };

//   const isValidCoordinate = (lat: number, lng: number): boolean => {
//     // Adjusted for Italian territory bounds
//     return (
//       !isNaN(lat) &&
//       !isNaN(lng) &&
//       lat >= 35 && 
//       lat <= 48 && 
//       lng >= 6 && 
//       lng <= 19 
//     );
//   };

//   const convertDMSToDecimal = (
//     degrees: number,
//     minutes: number,
//     seconds: number,
//     direction: string
//   ): number => {
//     let decimal = degrees + (minutes / 60) + (seconds / 3600);
//     if (direction === 'S' || direction === 'W') {
//       decimal = -decimal;
//     }
//     return decimal;
//   };

//   const processFiles = async () => {
//     setProcessing(true);
//     setError(null);
//     let allCoords: Coordinate[] = [];

//     for (const file of files) {
//       console.log(`Processing file: ${file.name}`);
//       try {
//         const arrayBuffer = await file.arrayBuffer();
//         const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
//         console.log(`PDF loaded successfully. Total pages: ${pdf.numPages}`);
        
//         for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
//           console.log(`Processing page ${pageNum}/${pdf.numPages}`);
//           const page = await pdf.getPage(pageNum);
//           const textContent = await page.getTextContent();
//           const pageText = textContent.items.map((item: any) => item.str).join(" ");
//           console.log(`Page ${pageNum} text length: ${pageText.length} characters`);
          
//           const extracted = extractCoordinatesFromText(pageText);
//           console.log(`Found ${extracted.length} coordinates on page ${pageNum}`);
//           allCoords = allCoords.concat(extracted);
//         }
//       } catch (err: any) {
//         console.error("Error processing file", {
//           fileName: file.name,
//           error: err,
//           stack: err.stack
//         });
//         setError(`Errore nell'elaborazione del file ${file.name}: ${err.message}`);
//       }
//     }

//     console.log(`Processing complete. Total coordinates found: ${allCoords.length}`);
//     setCoords(allCoords);
//     setProcessing(false);
//   };

//   const exportToKML = () => {
//     let kml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
//     kml += `<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n`;
    
//     coords.forEach((coord, index) => {
//       kml += `<Placemark>\n`;
//       kml += `<name>${coord.details.name || `Impianto ${index + 1}`}</name>\n`;
//       kml += `<description>`;
//       kml += `<![CDATA[`;
//       kml += `Tipo: ${coord.details.type}\n`;
//       kml += `Potenza: ${coord.details.capacity}\n`;
//       kml += `Area: ${coord.details.area}\n`;
//       kml += `Comune: ${coord.details.municipality}\n`;
//       kml += `Provincia: ${coord.details.province}\n`;
//       kml += `Sviluppatore: ${coord.details.developer}\n`;
//       kml += `]]>`;
//       kml += `</description>\n`;
//       kml += `<Point>\n`;
//       kml += `<coordinates>${coord.lng},${coord.lat},0</coordinates>\n`;
//       kml += `</Point>\n</Placemark>\n`;
//     });
    
//     kml += `</Document>\n</kml>`;

//     const blob = new Blob([kml], {
//       type: "application/vnd.google-earth.kml+xml",
//     });
//     const url = URL.createObjectURL(blob);
//     const a = document.createElement("a");
//     a.href = url;
//     a.download = "impianti_rinnovabili.kml";
//     a.click();
//     URL.revokeObjectURL(url);
//   };

//   return (
//     <Box sx={{ p: 2, border: "1px dashed gray" }}>
//       <Typography variant="h6" gutterBottom>
//         Analizzatore Documenti Rinnovabili
//       </Typography>
//       <input
//         type="file"
//         multiple
//         accept="application/pdf"
//         onChange={handleFileChange}
//       />
//       <Box sx={{ mt: 2 }}>
//         <Button
//           variant="contained"
//           onClick={processFiles}
//           disabled={files.length === 0 || processing}
//         >
//           {processing ? "Elaborazione in corso..." : "Elabora PDF"}
//         </Button>
//       </Box>
//       {processing && (
//         <Box sx={{ mt: 2 }}>
//           <CircularProgress />
//         </Box>
//       )}
//       {error && (
//         <Alert severity="error" sx={{ mt: 2 }}>
//           {error}
//         </Alert>
//       )}
//       {coords.length > 0 && (
//         <Box sx={{ mt: 2 }}>
//           <Typography>
//             Estratte {coords.length} coordinate{coords.length > 1 ? "" : ""}.
//           </Typography>
//           <Button variant="contained" onClick={exportToKML} sx={{ mt: 1 }}>
//             Esporta KML per Google Earth
//           </Button>
//         </Box>
//       )}
//     </Box>
//   );
// };

// export default PDFExplorer;


// import React, { useState } from "react";
// import { Button, Box, Typography, CircularProgress, Alert } from "@mui/material";
// import * as pdfjsLib from "pdfjs-dist/build/pdf";
// import "pdfjs-dist/build/pdf.worker.entry";

// // Configure the PDF.js worker:
// pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
//   "pdfjs-dist/build/pdf.worker.entry.js",
//   import.meta.url
// ).toString();

// // Define an interface for coordinate pairs.
// interface Coordinate {
//   lat: number;
//   lng: number;
// }

// const PDFExplorer: React.FC = () => {
//   // Set the files state as an array of File objects.
//   const [files, setFiles] = useState<File[]>([]);
//   const [processing, setProcessing] = useState<boolean>(false);
//   // Define coords as an array of Coordinate objects.
//   const [coords, setCoords] = useState<Coordinate[]>([]);
//   // Error state can be a string or null.
//   const [error, setError] = useState<string | null>(null);

//   // Handle file input changes.
//   const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     if (e.target.files) {
//       setFiles(Array.from(e.target.files));
//     }
//   };

//   // Simple regex extractor for decimal degree coordinates.
//   const extractCoordinatesFromText = (text: string): Coordinate[] => {
//     // Matches two decimal numbers (optionally negative) separated by comma or whitespace.
//     const regex = /(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/g;
//     let matches: RegExpExecArray | null;
//     const found: Coordinate[] = [];
//     while ((matches = regex.exec(text)) !== null) {
//       const lat = parseFloat(matches[1]);
//       const lng = parseFloat(matches[2]);
//       if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
//         found.push({ lat, lng });
//       }
//     }
//     return found;
//   };

//   // Process all selected PDFs: for each file, load with PDF.js, extract text, then extract coordinate pairs.
//   const processFiles = async () => {
//     setProcessing(true);
//     setError(null);
//     let allCoords: Coordinate[] = [];

//     for (const file of files) {
//       try {
//         const arrayBuffer = await file.arrayBuffer();
//         const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
//         for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
//           const page = await pdf.getPage(pageNum);
//           const textContent = await page.getTextContent();
//           // Note: 'textContent.items' is of type any[] since PDF.js doesn't provide strict types.
//           const pageText = textContent.items.map((item: any) => item.str).join(" ");
//           const extracted = extractCoordinatesFromText(pageText);
//           allCoords = allCoords.concat(extracted);
//         }
//       } catch (err: any) {
//         console.error("Error processing file", file.name, err);
//         setError(`Error processing file ${file.name}: ${err.message}`);
//       }
//     }

//     setCoords(allCoords);
//     setProcessing(false);
//   };

//   // Generate a KML string from the extracted coordinates and trigger a download.
//   const exportToKML = () => {
//     let kml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
//     kml += `<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n`;
//     coords.forEach((coord, index) => {
//       kml += `<Placemark>\n`;
//       kml += `<name>Location ${index + 1}</name>\n`;
//       kml += `<Point>\n`;
//       // KML expects coordinates as "longitude,latitude,altitude"
//       kml += `<coordinates>${coord.lng},${coord.lat},0</coordinates>\n`;
//       kml += `</Point>\n</Placemark>\n`;
//     });
//     kml += `</Document>\n</kml>`;

//     const blob = new Blob([kml], {
//       type: "application/vnd.google-earth.kml+xml",
//     });
//     const url = URL.createObjectURL(blob);
//     const a = document.createElement("a");
//     a.href = url;
//     a.download = "extracted_locations.kml";
//     a.click();
//     URL.revokeObjectURL(url);
//   };

//   return (
//     <Box sx={{ p: 2, border: "1px dashed gray" }}>
//       <Typography variant="h6" gutterBottom>
//         EsploraPDF
//       </Typography>
//       <input
//         type="file"
//         multiple
//         accept="application/pdf"
//         onChange={handleFileChange}
//       />
//       <Box sx={{ mt: 2 }}>
//         <Button
//           variant="contained"
//           onClick={processFiles}
//           disabled={files.length === 0 || processing}
//         >
//           {processing ? "Processing..." : "Process PDFs"}
//         </Button>
//       </Box>
//       {processing && (
//         <Box sx={{ mt: 2 }}>
//           <CircularProgress />
//         </Box>
//       )}
//       {error && (
//         <Alert severity="error" sx={{ mt: 2 }}>
//           {error}
//         </Alert>
//       )}
//       {coords.length > 0 && (
//         <Box sx={{ mt: 2 }}>
//           <Typography>
//             Extracted {coords.length} coordinate pair{coords.length > 1 ? "s" : ""}.
//           </Typography>
//           <Button variant="contained" onClick={exportToKML} sx={{ mt: 1 }}>
//             Export to Google Earth (KML)
//           </Button>
//         </Box>
//       )}
//     </Box>
//   );
// };

// export default PDFExplorer;
