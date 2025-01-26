import axios from 'axios';

const api = axios.create({
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  }
});

export const searchProjects = async (keyword, page = 1, searchType = 'o') => {
  try {
    const response = await api.get('/api/search', {
      params: {
        keyword: keyword.trim(),
        page,
        searchType
      }
    });
    
    if (response.data.error) {
      throw new Error(response.data.error);
    }
    
    return response.data;
  } catch (error) {
    console.error('API Error:', error);
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw new Error('Failed to fetch results. Please try again.');
  }
};
