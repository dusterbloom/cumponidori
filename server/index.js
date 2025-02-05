// server/index.js
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import axios from 'axios';

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VALID_STATUSES = [
  'Valutazione preliminare',
  'Verifica di Ottemperanza',
  'Valutazione Impatto Ambientale',
  'Valutazione Impatto Ambientale (PNIEC-PNRR)',
  'Verifica di Assoggettabilità a VIA',
  'Provvedimento Unico in materia Ambientale (PNIEC-PNRR)',
  'Definizione contenuti SIA (PNIEC-PNRR)'
];


const app = express();
const PORT = process.env.PORT || 3005;

// Update CORS configuration
// const corsOptions = {
//   origin: [
//     'https://cumponidori.netlify.app',
//     'http://localhost:5174',
//     'http://localhost:3000'
//   ],
//   methods: ['GET', 'POST', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization'],
//   credentials: true,
//   optionsSuccessStatus: 200
// };

// Apply CORS middleware
// app.use(cors(corsOptions));

// Handle preflight requests
// app.options('*', cors(corsOptions));


// Middleware
app.use(cors({
  origin: ['http://localhost:5174', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));


// Add error handling middleware
// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  res.header('Access-Control-Allow-Origin', 'http://localhost:5174');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// 404 handler
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});


// Python process management
let pythonProcess = null;
let isInitializing = false;

function initializePythonProcess() {
  if (isInitializing) return;
  isInitializing = true;

  const scriptPath = join(__dirname, 'nlp_service.py');
  console.log('Starting Python process:', scriptPath);

  pythonProcess = spawn('python', [scriptPath]);

  pythonProcess.stdout.on('data', (data) => {
    console.log(`Python stdout: ${data}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`Python stderr: ${data}`);
  });

  pythonProcess.on('close', (code) => {
    console.log(`Python process exited with code ${code}`);
    pythonProcess = null;
    isInitializing = false;
    setTimeout(initializePythonProcess, 5000);
  });
}

// Test endpoint
app.get('/api/test', (req, res) => {
  console.log('Test endpoint hit');
  res.json({ message: 'Server is working!' });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    pythonService: pythonProcess ? 'running' : 'stopped'
  });
});

// PDF analysis endpoint
app.post('/api/analyze-pdf', async (req, res) => {
  console.log('Analyze PDF endpoint hit');
  
  if (!pythonProcess) {
    try {
      initializePythonProcess();
    } catch (error) {
      console.error('Failed to initialize Python process:', error);
      return res.status(500).json({
        error: 'Failed to initialize NLP service',
        details: error.message
      });
    }
  }

  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'PDF content is required' });
    }

    console.log('Sending data to Python process');
    pythonProcess.stdin.write(JSON.stringify({ content }) + '\n');

    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('NLP analysis timeout'));
      }, 30000);

      pythonProcess.stdout.once('data', (data) => {
        clearTimeout(timeout);
        try {
          resolve(JSON.parse(data.toString()));
        } catch (e) {
          reject(new Error('Invalid response from NLP service'));
        }
      });

      pythonProcess.stderr.once('data', (data) => {
        clearTimeout(timeout);
        reject(new Error(`NLP service error: ${data.toString()}`));
      });
    });

    res.json(result);
  } catch (error) {
    console.error('PDF Analysis error:', error);
    res.status(500).json({ 
      error: 'Failed to analyze PDF',
      details: error.message 
    });
  }
});

// Add this with your other endpoint definitions
// app.post('/api/analyze-pdf', async (req, res) => {
//   console.log('Received analyze-pdf request');
  
//   if (!pythonProcess) {
//     try {
//       initializePythonProcess();
//     } catch (error) {
//       console.error('Failed to initialize Python process:', error);
//       return res.status(500).json({
//         error: 'Failed to initialize NLP service',
//         details: error.message
//       });
//     }
//   }

//   try {
//     const { content } = req.body;
//     if (!content) {
//       return res.status(400).json({ error: 'PDF content is required' });
//     }

//     console.log('Sending data to Python process');
    
//     // Send data to Python process
//     pythonProcess.stdin.write(JSON.stringify({ content }) + '\n');

//     // Get response from Python process
//     const result = await new Promise((resolve, reject) => {
//       const timeout = setTimeout(() => {
//         reject(new Error('NLP analysis timeout'));
//       }, 30000);

//       let dataBuffer = '';

//       const handleData = (data) => {
//         dataBuffer += data.toString();
//         try {
//           const result = JSON.parse(dataBuffer);
//           clearTimeout(timeout);
//           pythonProcess.stdout.removeListener('data', handleData);
//           resolve(result);
//         } catch (e) {
//           // If JSON.parse fails, we might need more data
//         }
//       };

//       pythonProcess.stdout.on('data', handleData);

//       pythonProcess.stderr.once('data', (data) => {
//         clearTimeout(timeout);
//         pythonProcess.stdout.removeListener('data', handleData);
//         reject(new Error(`NLP service error: ${data.toString()}`));
//       });
//     });

//     console.log('Analysis complete:', result);
//     res.json(result);
//   } catch (error) {
//     console.error('PDF Analysis error:', error);
//     res.status(500).json({ 
//       error: 'Failed to analyze PDF',
//       details: error.message 
//     });
//   }
// });

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something broke!',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// 404 handler
app.use((req, res) => {
  console.log('404 Not Found:', req.method, req.url);
  res.status(404).json({ error: 'Not Found' });
});




const BASE_URL = "https://va.mite.gov.it";

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// -----------------------------------
// /api/search
// -----------------------------------
app.get('/api/search', async (req, res) => {
  try {
    const { keyword = '', page = 1, status } = req.query;

    if (!keyword.trim()) {
      return res.status(400).json({ error: 'Keyword is required' });
    }

    const searchEndpoint = "/it-IT/Ricerca/ViaLibera";
    const params = new URLSearchParams({
      Testo: keyword,
      t: 'o',
      pagina: page,
      x: '26',  // Add these parameters as seen in the working URL
      y: '11',
      __RequestVerificationToken: '' // This might be needed but can be empty

    });

    if (status && status !== 'all' && VALID_STATUSES.includes(status)) {
      params.append('status', status);
    }

    const url = `${BASE_URL}${searchEndpoint}?${params}`;
    console.log('Fetching URL:', url);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',  // Add cache control headers
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    let projects = [];
    // Update selector to match the exact table structure
    $('.ElencoViaVasRicerca tr').each((i, row) => {
      // Skip header row
      if (i === 0) return;

      const cells = $(row).find('td');
      if (cells.length >= 5) {
        const projectStatus = $(cells[2]).text().trim();
        const infoLink = $(cells[3]).find('a').attr('href');
        const docLink = $(cells[4]).find('a').attr('href');

        // Only add if we have valid links
        if (infoLink) {
          const project = {
            title: $(cells[0]).text().trim(),
            proponent: $(cells[1]).text().trim(),
            status: projectStatus,
            url: infoLink ? new URL(infoLink, BASE_URL).href : '',
            doc_url: docLink ? new URL(docLink, BASE_URL).href : '',
            id: infoLink ? infoLink.split('/').pop() : `project-${i}`
          };
          projects.push(project);
        }
      }
    });

    // Update pagination parsing
    let totalPages = 1;
    const paginationText = $('.pagination .etichettaRicerca').text().trim();
    const match = paginationText.match(/Pagina\s+(\d+)\s+di\s+(\d+)/i);
    if (match && match[2]) {
      totalPages = parseInt(match[2], 10);
    }

    res.json({
      projects,
      totalPages,
      currentPage: parseInt(page),
      total: projects.length,
      validStatuses: VALID_STATUSES
    });

  } catch (error) {
    console.error('Server error in /api/search:', error);
    res.status(500).json({
      error: 'Failed to fetch data',
      details: error.message
    });
  }})


// -----------------------------------
// /api/procedure
// -----------------------------------
app.get('/api/procedure', async (req, res) => {
  try {
    const { detailUrl } = req.query;
    if (!detailUrl) {
      return res.status(400).json({ error: 'Detail URL is required' });
    }

    const decodedUrl = decodeURIComponent(detailUrl);
    console.log(`[INFO] Parsing detail page => ${decodedUrl}`);
    
    const response = await fetch(decodedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const proceduraLinks = [];

    // e.g. anchor tags with href * "/it-IT/Oggetti/Documentazione/"
    $('a[href*="/it-IT/Oggetti/Documentazione/"]').each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        const fullUrl = new URL(href, BASE_URL).href;
        if (!proceduraLinks.includes(fullUrl)) {
          proceduraLinks.push(fullUrl);
        }
      }
    });

    res.json(proceduraLinks);
  } catch (error) {
    console.error('Server error in /api/procedure:', error);
    res.status(500).json({
      error: 'Failed to fetch procedure links',
      details: error.message
    });
  }
});



function findTotalPages($) {
  try {
    // Look for pagination info
    const paginationText = $('.pagination .etichettaRicerca').text().trim();
    const match = paginationText.match(/Pagina\s+(\d+)\s+di\s+(\d+)/i);
    
    if (match && match[2]) {
      return parseInt(match[2], 10);
    }
    
    // If no pagination found, check if there's at least one row in the table
    const hasRows = $('table.Documentazione tr').length > 1;
    return hasRows ? 1 : 0;
  } catch (error) {
    console.warn('Error finding total pages:', error);
    return 1; // Default to 1 page if we can't determine the count
  }
}


// -----------------------------------
// /api/documents  -- UPDATED!!
// -----------------------------------
app.get('/api/documents', async (req, res) => {
  let page;
  
  try {
    const { procedureUrl } = req.query;
    page = parseInt(req.query.page || '1', 10);

    if (!procedureUrl) {
      return res.status(400).json({ 
        error: 'Procedure URL is required',
        docs: [],
        currentPage: 1,
        totalPages: 1
      });
    }

    const url = `${procedureUrl}${procedureUrl.includes('?') ? '&' : '?'}pagina=${page}`;
    console.log(`[INFO] Parsing procedure page => ${url}`);

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      timeout: 30000 // 30 second timeout
    });

    const html = response.data;
    const $ = cheerio.load(html);


    // Check if there's a "Documentazione" table
    const table = $('table.Documentazione');
    if (!table.length) {
      console.log(`[WARN] No 'Documentazione' table found for page ${page}`);
      return res.json({ 
        docs: [], 
        currentPage: page, 
        totalPages: 1,
        warning: 'No documentation table found'
      });
    }

    // Collect doc links
    const docs = [];
    table.find('tr').slice(1).each((_, row) => {
      const cols = $(row).find('td');
      if (cols.length < 9) return;

      const nomeFile = $(cols[1]).text().trim();
      const downloadLink = $(cols[8]).find('a[title="Scarica il documento"]').attr('href');
      if (downloadLink) {
        const fullDownloadUrl = new URL(downloadLink, BASE_URL).href;
        const documentId = downloadLink.split('/').pop();
        docs.push({
          id: documentId,
          filename: nomeFile || `document-${documentId}.pdf`,
          downloadUrl: fullDownloadUrl,
        });
      }
    });

    // Get total pages using our helper function
    const totalPages = findTotalPages($);

    console.log(`[INFO] Found ${docs.length} doc(s) on page ${page}/${totalPages}`);
    
    return res.json({
      docs,
      currentPage: page,
      totalPages,
      warning: docs.length === 0 ? 'No documents found on this page' : undefined
    });

  } catch (error) {
    console.error('[ERROR] Server error in /api/documents:', error);
    
    // More detailed error response
    return res.status(error.response?.status || 500).json({
      error: 'Failed to fetch document links',
      details: error.message,
      docs: [],
      currentPage: page || 1,
      totalPages: 1,
      statusCode: error.response?.status,
      statusText: error.response?.statusText
    });
  }
});
// -----------------------------------
// /api/download
// -----------------------------------
app.get('/api/download', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'Document URL is required' });
    }

    console.log(`[INFO] Downloading document from: ${url}`);

    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/pdf,application/octet-stream',
      }
    });

    // Parse the remote header's content-disposition to extract the filename
    const remoteDisposition = response.headers['content-disposition'];
    let filename = 'document.pdf'; // fallback if no filename can be determined

    if (remoteDisposition) {
      // This regex looks for filename= followed by either a quoted or unquoted string
      const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i;
      const matches = filenameRegex.exec(remoteDisposition);
      if (matches != null && matches[1]) {
        // Remove surrounding quotes if any
        filename = matches[1].replace(/['"]/g, '');
      }
    }

    // Set the proper headers for file download.
    res.setHeader('Content-Type', response.headers['content-type'] || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Stream the file content to the client.
    response.data.pipe(res);

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      error: 'Failed to download document',
      details: error.message
    });
  }
});


// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something broke!',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// 404 handler
app.use((req, res) => {
  console.log('404 Not Found:', req.method, req.url);
  res.status(404).json({ error: 'Not Found' });
});


// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Available endpoints:');
  console.log('- GET /api/search');
  console.log('- GET /api/procedure');
  console.log('- GET /api/documents');
  console.log('- GET /api/download');
});

server.on('error', (error) => {
  console.error('Server error:', error);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
