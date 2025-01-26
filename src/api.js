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
  baseURL: 'http://localhost:3001', // Add baseURL
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
    const response = await api.get('/api/documents', {
      params: {
        procedureUrl
      }
    });
    
    // Transform the response to include download URLs
    const documentsWithUrls = response.data.map(doc => ({
      ...doc,
      downloadUrl: getDocumentDownloadUrl(doc.id)
    }));
    
    return documentsWithUrls;
  } catch (error) {
    console.error('API Error:', error);
    throw new Error(error.response?.data?.error || 'Failed to fetch document links. Please try again.');
  }
};

// Add a helper function to download documents
export const downloadDocument = async (documentId, filename) => {
  try {
    const response = await axios({
      url: getDocumentDownloadUrl(documentId),
      method: 'GET',
      responseType: 'blob'
    });

    // Create a download link and trigger it
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename || `document-${documentId}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Download Error:', error);
    throw new Error('Failed to download document. Please try again.');
  }
};