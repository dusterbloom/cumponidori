const express = require('express');
const serverless = require('serverless-http');
const app = express();
const router = express.Router();
const cors = require('cors');

// Enable CORS
app.use(cors());

// Your existing routes, but with the base path modified
router.get('/', (req, res) => {
  res.json({ message: 'API is running' });
});


router.get('/api/search', async (req, res) => {

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

// // Add your existing routes here
// router.get('/api/projects', async (req, res) => {
//   // Your existing project search logic
// });

router.get('/api/procedure', async (req, res) => {
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
      }});

router.get('/api/documents', async (req, res) => {
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

router.get('/api/download', async (req, res) => {
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

// Important: Change the base path to use Netlify Functions path
app.use('/.netlify/functions/server', router);

// Export the serverless handler
module.exports.handler = serverless(app);