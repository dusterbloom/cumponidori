import axios from 'axios';


const STATUS_OPTIONS = [
  'Valutazione preliminare',
  'Verifica di Ottemperanza',
  'Valutazione Impatto Ambientale',
  'Valutazione Impatto Ambientale (PNIEC-PNRR)',
  'Verifica di Assoggettabilità a VIA',
  'Provvedimento Unico in materia Ambientale (PNIEC-PNRR)',
  'Definizione contenuti SIA (PNIEC-PNRR)'
];

const api = axios.create({
  baseURL: import.meta.env.PROD 
    ? 'https://cumponidori.onrender.com'  // Production URL
    : 'http://localhost:3005',            // Development URL
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  }
});

export const searchProjects = async (keyword, page = 1, status = 'all') => {
  if (!keyword?.trim()) {
    return { projects: [], totalPages: 1, currentPage: 1, total: 0 };
  }

  try {
    const params = {
      keyword: keyword.trim(),
      page
    };
    
  // Only add status if it's a valid option
  if (status && status !== 'all' && STATUS_OPTIONS.includes(status)) {
    params.status = status;
  }

    const response = await api.get('/api/search', { params });
    
    if (response.data.error) {
      throw new Error(response.data.error);
    }
    
    return response.data;
  } catch (error) {
    console.error('API Error:', error);
    throw new Error(error.response?.data?.error || 'Failed to fetch results. Please try again.');
  }
};


export const getProcedureLinks = async (detailUrl) => {
  try {
    // Don't encode the URL here - axios will handle it
    const response = await api.get('/api/procedure', {
      params: {
        detailUrl
      }
    });
    
    if (response.data.error) {
      throw new Error(response.data.error);
    }
    
    return response.data;
  } catch (error) {
    console.error('API Error:', error);
    if (error.response?.status === 404) {
      throw new Error('Procedure endpoint not found. Please check server configuration.');
    }
    throw new Error(error.response?.data?.error || 'Failed to fetch procedure links. Please try again.');
  }
};

export const getDocumentDownloadUrl = (documentId) => {
  return `https://va.mite.gov.it/File/Documento/${documentId}`;
};


export const getDocumentLinks = async (procedureUrl) => {
  try {
    let allDocs = [];
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      console.log(`Fetching documents page ${page} for ${procedureUrl}`);
      
      const response = await api.get('/api/documents', {
        params: { procedureUrl, page }
      });
      
      // Log the full response for debugging
      console.log(`Page ${page} response:`, response.data);
      
      // Validate response structure
      if (!response.data || typeof response.data !== 'object') {
        console.error('Invalid response format:', response.data);
        throw new Error('Invalid server response format');
      }

      const { docs, currentPage, totalPages } = response.data;

      // Validate docs array
      if (!Array.isArray(docs)) {
        console.error('Server returned non-array docs:', docs);
        throw new Error('Server returned invalid document data');
      }

      // Add documents to our collection
      allDocs = [...allDocs, ...docs];

      // Check if we should continue
      hasMorePages = currentPage < totalPages;
      page++;

      // Safety check - break if we somehow go beyond totalPages
      if (page > totalPages) {
        console.warn('Reached beyond total pages, stopping');
        break;
      }
    }

    return allDocs;
  } catch (error) {
    console.error('API Error in getDocumentLinks:', error);
    throw new Error(`Failed to fetch document links: ${error.message}`);
  }
};

