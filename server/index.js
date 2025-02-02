// server/index.js
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import axios from 'axios';



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
const corsOptions = {
  origin: [
    'https://cumponidori.netlify.app',
    'http://localhost:5173',
    'http://localhost:3005'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Add error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    details: err.message,
    docs: [],
    currentPage: 1,
    totalPages: 1
  });
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
// app.get('/api/search', async (req, res) => {
//   try {
//     const { keyword = '', status } = req.query;
//     // Use the page parameter only for the final (re‑paginated) results.
//     const requestedPage = parseInt(req.query.page || '1', 10);

//     if (!keyword.trim()) {
//       return res.status(400).json({ error: 'Keyword is required' });
//     }

//     const searchEndpoint = "/it-IT/Ricerca/ViaLibera";
//     const params = new URLSearchParams({
//       Testo: keyword.trim(),
//       t: 'o'
//     });

//     // -----------------------------------
//     // Step 1. Fetch the first page to determine total pages
//     // -----------------------------------
//     const firstPageUrl = `${BASE_URL}${searchEndpoint}?${params.toString()}&pagina=1`;
//     console.log('Fetching URL for pagination metadata:', firstPageUrl);
//     const firstResponse = await fetch(firstPageUrl, {
//       headers: {
//         'User-Agent': 'Mozilla/5.0',
//         'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
//         'Accept-Language': 'en-US,en;q=0.5'
//       }
//     });

//     if (!firstResponse.ok) {
//       throw new Error(`HTTP error on page 1! status: ${firstResponse.status}`);
//     }

//     const firstHtml = await firstResponse.text();
//     const $first = cheerio.load(firstHtml);
//     let scrapedTotalPages = 1;
//     const paginationLabel = $first('.pagination .etichettaRicerca').text();
//     const match = paginationLabel.match(/Pagina\s+(\d+)\s+di\s+(\d+)/);
//     if (match) {
//       scrapedTotalPages = parseInt(match[2], 10);
//     }
//     console.log(`External site reports ${scrapedTotalPages} total page(s)`);

//     // -----------------------------------
//     // Step 2. Fetch all pages to collect all projects, then filter them.
//     // -----------------------------------
//     // (You may consider fetching these concurrently if performance is an issue)
//     let allProjects = [];

//     // Helper function to process one page of results.
//     const processPage = async (p) => {
//       const pageUrl = `${BASE_URL}${searchEndpoint}?${params.toString()}&pagina=${p}`;
//       console.log(`Fetching page ${p}: ${pageUrl}`);
//       const response = await fetch(pageUrl, {
//         headers: {
//           'User-Agent': 'Mozilla/5.0',
//           'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
//           'Accept-Language': 'en-US,en;q=0.5'
//         }
//       });
//       if (!response.ok) {
//         console.warn(`Page ${p} fetch failed with status ${response.status}`);
//         return;
//       }
//       const html = await response.text();
//       const $ = cheerio.load(html);
//       $('.ElencoViaVasRicerca tr').slice(1).each((i, row) => {
//         const cells = $(row).find('td');
//         if (cells.length >= 5) {
//           const projectStatus = $(cells[2]).text().trim();
//           // Apply filter if a valid status is provided
//           if (status && status !== 'all' && VALID_STATUSES.includes(status)) {
//             if (projectStatus !== status) {
//               return; // Skip this row
//             }
//           }
//           // Only add if the status is known (optional safeguard)
//           if (VALID_STATUSES.includes(projectStatus)) {
//             const infoLink = $(cells[3]).find('a').attr('href');
//             const docLink = $(cells[4]).find('a').attr('href');
//             const project = {
//               title: $(cells[0]).text().trim(),
//               proponent: $(cells[1]).text().trim(),
//               status: projectStatus,
//               url: infoLink ? new URL(infoLink, BASE_URL).href : '',
//               doc_url: docLink ? new URL(docLink, BASE_URL).href : '',
//               id: infoLink ? infoLink.split('/').pop() : `project-${i}-${p}`
//             };
//             allProjects.push(project);
//           }
//         }
//       });
//     };

//     // For demonstration, we fetch sequentially. For performance, consider Promise.all over an array of pages.
//     for (let p = 1; p <= scrapedTotalPages; p++) {
//       await processPage(p);
//     }

//     // -----------------------------------
//     // Step 3. Re‑paginate the filtered projects.
//     // -----------------------------------
//     const pageSize = 20; // Set your desired page size
//     const totalFiltered = allProjects.length;
//     const totalPages = Math.ceil(totalFiltered / pageSize);
//     const startIndex = (requestedPage - 1) * pageSize;
//     const paginatedProjects = allProjects.slice(startIndex, startIndex + pageSize);

//     // Return results:
//     res.json({
//       projects: paginatedProjects,
//       totalPages,
//       currentPage: requestedPage,
//       total: totalFiltered,
//       validStatuses: VALID_STATUSES
//     });
//   } catch (error) {
//     console.error('Server error in /api/search:', error);
//     res.status(500).json({
//       error: 'Failed to fetch data',
//       details: error.message
//     });
//   }
// });
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
