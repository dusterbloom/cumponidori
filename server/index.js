// server/index.js
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

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? 'https://cumponidori.netlify.app'
    : 'http://localhost:5173',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
}));

// For preflight requests
app.options('*', cors());

app.use(express.json());

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
      pagina: page
    });

    const url = `${BASE_URL}${searchEndpoint}?${params}`;
    console.log('Fetching URL:', url);

    const response = await fetch(url, {
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

    let projects = [];
    // Table rows
    $('.ElencoViaVasRicerca tr').slice(1).each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 5) {
        const projectStatus = $(cells[2]).text().trim();
        // If the client wants to filter by "status" server-side
        // and it's a valid status, skip those that don't match
        if (status && status !== 'all' && VALID_STATUSES.includes(status)) {
          if (projectStatus !== status) {
            return;
          }
        }
        // Only add if the status is in the known list
        if (VALID_STATUSES.includes(projectStatus)) {
          const infoLink = $(cells[3]).find('a').attr('href');
          const docLink = $(cells[4]).find('a').attr('href');
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

    // Pagination
    let totalPages = 1;
    const paginationLabel = $('.pagination .etichettaRicerca').text();
    const match = paginationLabel.match(/Pagina\s+(\d+)\s+di\s+(\d+)/);
    if (match) {
      totalPages = parseInt(match[2]);
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
  }
});

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

// -----------------------------------
// /api/documents  -- UPDATED!!
// -----------------------------------
// Instead of fetching *all pages* in one request, we now fetch *one* page based on `req.query.page`.
app.get('/api/documents', async (req, res) => {
  try {
    const { procedureUrl } = req.query;
    let { page } = req.query;

    if (!procedureUrl) {
      return res.status(400).json({ error: 'Procedure URL is required' });
    }
    // Default page=1 if not provided
    if (!page) page = 1;
    const pageNum = parseInt(page, 10);

    // Build the page-specific URL
    const url = `${procedureUrl}${procedureUrl.includes('?') ? '&' : '?'}pagina=${pageNum}`;
    console.log(`[INFO] Parsing procedure page => ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Check if there's a "Documentazione" table at all
    const table = $('table.Documentazione');
    if (!table.length) {
      console.log(`[WARN] No 'Documentazione' table found for page ${pageNum}.`);
      // Return empty array, but totalPages=1 so the client won't keep going
      return res.json({ docs: [], currentPage: pageNum, totalPages: 1 });
    }

    // Collect doc links from *this single page*
    const docLinks = [];
    table.find('tr').slice(1).each((_, row) => {
      const cols = $(row).find('td');
      if (cols.length < 9) return;

      const nomeFile = $(cols[1]).text().trim();
      const downloadLink = $(cols[8]).find('a[title="Scarica il documento"]').attr('href');
      if (downloadLink) {
        const fullDownloadUrl = new URL(downloadLink, BASE_URL).href;
        const documentId = downloadLink.split('/').pop();
        docLinks.push({
          id: documentId,
          filename: nomeFile || `document-${documentId}.pdf`,
          downloadUrl: fullDownloadUrl,
        });
      }
    });

    // Figure out how many total pages there are
    const totalPages = findTotalPages($);

    console.log(`[INFO] Found ${docLinks.length} doc(s) on page ${pageNum}/${totalPages}.`);
    // Return JSON with these docs + page info
    return res.json({
      docs: docLinks,
      currentPage: pageNum,
      totalPages
    });

  } catch (error) {
    console.error('Server error in /api/documents:', error);
    return res.status(500).json({
      error: 'Failed to fetch document links for this page',
      details: error.message
    });
  }
});

// Helper function to parse "Pagina 1 di 8" from .pagination .etichettaRicerca
function findTotalPages($) {
  const paginationLabel = $('.pagination .etichettaRicerca').text();
  const match = paginationLabel.match(/Pagina\s+(\d+)\s+di\s+(\d+)/);
  if (match) {
    return parseInt(match[2]);
  }
  return 1;
}

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

    // Set PDF headers
    res.setHeader('Content-Type', response.headers['content-type'] || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${response.headers['content-disposition'] || 'document.pdf'}"`);

    // Stream the response directly to the client
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
