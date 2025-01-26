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
app.use(cors());
app.use(express.json());

const BASE_URL = "https://va.mite.gov.it";

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

app.get('/api/search', async (req, res) => {
  try {
    const { keyword = '', page = 1, status } = req.query;
    
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
        
        // Only add project if status is valid and matches filter (if provided)
        if ((!status || status === 'all' || projectStatus === status) && 
            (VALID_STATUSES.includes(projectStatus))) {
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

// Start the server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
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
