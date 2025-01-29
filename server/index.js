import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const app = express();
const PORT = 3001;


const VALID_STATUSES = [
  'Valutazione preliminare',
  'Verifica di Ottemperanza',
  'Valutazione Impatto Ambientale',
  'Valutazione Impatto Ambientale (PNIEC-PNRR)',
  'Verifica di Assoggettabilità a VIA',
  'Provvedimento Unico in materia Ambientale (PNIEC-PNRR)',
  'Definizione contenuti SIA (PNIEC-PNRR)'
];

// Configure CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://cumponidori.netlify.app']  // Array of allowed origins
    : 'http://localhost:5173',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
}));

// Add preflight OPTIONS handler
app.options('*', cors());

app.use(express.json());

const BASE_URL = "https://va.mite.gov.it";

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});


app.get('/api/search', async (req, res) => {
  try {
    const { keyword = '', page = 1 } = req.query;

    if (!keyword.trim()) {
      return res.status(400).json({ error: 'Keyword is required' });
    }

    const searchEndpoint = "/it-IT/Ricerca/ViaLibera";
    const params = new URLSearchParams({
      Testo: keyword,
      t: 'o', // Keep default search type
      pagina: page
    });

    const url = `${BASE_URL}${searchEndpoint}?${params}`;
    console.log('Fetching URL:', url);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    let projects = [];

    // Parse the table rows
    $('.ElencoViaVasRicerca tr').slice(1).each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 5) {
        const projectStatus = $(cells[2]).text().trim();

        // Only add project if status is valid
        if (VALID_STATUSES.includes(projectStatus)) {
          const infoLink = $(cells[3]).find('a').attr('href');
          const docLink = $(cells[4]).find('a').attr('href');

          const project = {
            title: $(cells[0]).text().trim(),
            proponent: $(cells[1]).text().trim(),
            status: projectStatus,
            url: infoLink ? new URL(infoLink, BASE_URL).href : '',
            doc_url: docLink ? new URL(docLink, BASE_URL).href : '',
            id: infoLink ? infoLink.split('/').pop() : `project-${i}`,
          };

          projects.push(project);
        }
      }
    });

    // Parse pagination info
    let totalPages = 1;
    const paginationLabel = $('.pagination .etichettaRicerca').text();
    const match = paginationLabel.match(/Pagina\s+(\d+)\s+di\s+(\d+)/);
    if (match) {
      totalPages = parseInt(match[2]);
    }

    console.log(`Found ${projects.length} projects (after filtering), total pages: ${totalPages}`);

    res.json({
      projects,
      totalPages,
      currentPage: parseInt(page),
      total: projects.length,
      validStatuses: VALID_STATUSES // Include valid statuses in response
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch data',
      details: error.message 
    });
  }
});



app.get('/api/procedure', async (req, res) => {
  try {
    const { detailUrl } = req.query;

    if (!detailUrl) {
      return res.status(400).json({ error: 'Detail URL is required' });
    }

    // Decode the URL if it's encoded
    const decodedUrl = decodeURIComponent(detailUrl);
    
    console.log(`[INFO] Parsing detail page => ${decodedUrl}`);
    
    try {
      const response = await fetch(decodedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
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

      // Find all documentation sections
      $('a[href*="/it-IT/Oggetti/Documentazione/"]').each((_, element) => {
        const href = $(element).attr('href');
        if (href) {
          const fullUrl = new URL(href, BASE_URL).href;
          if (!proceduraLinks.includes(fullUrl)) {
            proceduraLinks.push(fullUrl);
          }
        }
      });

      console.log(`[INFO] Found ${proceduraLinks.length} procedure links in ${decodedUrl}`);
      res.json(proceduraLinks);
    } catch (error) {
      console.error('Fetch error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch procedure links',
        details: error.message 
      });
    }
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch procedure links',
      details: error.message 
    });
  }
});

app.get('/api/documents', async (req, res) => {
  try {
    const { procedureUrl } = req.query;

    if (!procedureUrl) {
      return res.status(400).json({ error: 'Procedure URL is required' });
    }

    console.log(`[INFO] Parsing procedure page => ${procedureUrl}`);
    const docLinks = [];
    let page = 1;

    while (true) {
      const url = `${procedureUrl}${procedureUrl.includes('?') ? '&' : '?'}pagina=${page}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const table = $('table.Documentazione');

      if (!table.length) {
        console.log(`[WARN] No 'Documentazione' table found in ${url}`);
        break;
      }

      // Process current page's documents
      table.find('tr').slice(1).each((_, row) => {
        const cols = $(row).find('td');
        if (cols.length < 9) return;

        const nomeFile = $(cols[1]).text().trim();
        const downloadLink = $(cols[8]).find('a[title="Scarica il documento"]').attr('href');

        if (downloadLink) {
          const downloadUrl = new URL(downloadLink, BASE_URL).href;
          const documentId = downloadLink.split('/').pop();
          docLinks.push({
            id: documentId,
            filename: nomeFile || `document-${documentId}.pdf`,
            downloadUrl: new URL(downloadLink, BASE_URL).href // Make sure this is an absolute URL
          });
        }
      });

      // Check if there are more pages
      const totalPages = await findTotalPages($);
      console.log(`[INFO] Processing documents page ${page}/${totalPages}`);

      if (page >= totalPages) {
        break;
      }

      page += 1;
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay between requests
    }

    console.log(`[INFO] Found ${docLinks.length} total document links in ${procedureUrl}`);
    res.json(docLinks);
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch document links',
      details: error.message 
    });
  }
});



app.get('/api/download', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'Document URL is required' });
    }

    console.log(`[INFO] Downloading document from: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/pdf,application/octet-stream',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Force download with Content-Disposition
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="document.pdf"');

    // Pipe the response directly to the client
    response.body.pipe(res);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ 
      error: 'Failed to download document',
      details: error.message 
    });
  }
});

async function findTotalPages($) {
  const paginationLabel = $('.pagination .etichettaRicerca').text();
  const match = paginationLabel.match(/Pagina\s+(\d+)\s+di\s+(\d+)/);
  if (match) {
    return parseInt(match[2]);
  }
  return 1;
}


// Start the server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Available endpoints:');
  console.log('- GET /api/search');
  console.log('- GET /api/procedure');
  console.log('- GET /api/documents');
});

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
});

// Handle process termination
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
