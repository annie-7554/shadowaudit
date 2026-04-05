import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.message ?? error.message ?? 'An unexpected error occurred';
    return Promise.reject(new Error(message));
  }
);

export default client;
