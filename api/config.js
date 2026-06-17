export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    url: process.env.VITE_SUPABASE_URL || '',
    key: process.env.VITE_SUPABASE_ANON_KEY || ''
  });
}
