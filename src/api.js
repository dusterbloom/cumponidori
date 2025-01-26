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