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

const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? process.env.REACT_APP_API_URL  // Will be your Render service URL
  : 'http://localhost:3001';

  const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
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
    
    if (response.data.error) {
      throw new Error(response.data.error);
    }
    
    return response.data;
  } catch (error) {
    console.error('API Error:', error);
    throw new Error(error.response?.data?.error || 'Failed to fetch document links. Please try again.');
  }
};


// Add a helper function to download documents
const downloadDocument = async (doc) => {
  try {
    const response = await fetch(doc.downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/pdf,application/octet-stream',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', doc.filename || `document-${doc.id}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    
    // Add a small delay after each download
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (error) {
    console.error(`Error downloading ${doc.filename}:`, error);
    throw error;
  }
};