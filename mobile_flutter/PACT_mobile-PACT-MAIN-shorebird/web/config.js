const webConfig = {
  development: {
    supabaseUrl: 'https://abznugnirnlrqnnfkein.supabase.co',
    authCallbackUrl: 'http://localhost:3000',
  },
  production: {
    supabaseUrl: 'https://abznugnirnlrqnnfkein.supabase.co',
    authCallbackUrl: 'https://your-production-domain.com', // Update this with your actual production domain
  },
};

export const getConfig = () => {
  const isProd = window.location.hostname !== 'localhost';
  return webConfig[isProd ? 'production' : 'development'];
};