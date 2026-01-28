// Тестовый API для проверки переменных окружения
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    console.log('=== ENVIRONMENT VARIABLES TEST ===');
    
    const envVars = {
      'SUPABASE_URL': {
        exists: !!process.env.SUPABASE_URL,
        value: process.env.SUPABASE_URL ? process.env.SUPABASE_URL.substring(0, 20) + '...' : 'NOT_SET'
      },
      'SUPABASE_ANON_KEY': {
        exists: !!process.env.SUPABASE_ANON_KEY,
        value: process.env.SUPABASE_ANON_KEY ? process.env.SUPABASE_ANON_KEY.substring(0, 20) + '...' : 'NOT_SET'
      },
      'DEEPSEEK_API_KEY': {
        exists: !!process.env.DEEPSEEK_API_KEY,
        value: process.env.DEEPSEEK_API_KEY ? process.env.DEEPSEEK_API_KEY.substring(0, 20) + '...' : 'NOT_SET'
      },
      'BOT_TOKEN': {
        exists: !!process.env.BOT_TOKEN,
        value: process.env.BOT_TOKEN ? process.env.BOT_TOKEN.substring(0, 20) + '...' : 'NOT_SET'
      }
    };

    console.log('Environment variables:', envVars);

    return res.status(200).json({
      success: true,
      message: 'Environment variables check',
      environment: process.env.NODE_ENV || 'development',
      variables: envVars,
      allKeys: Object.keys(process.env).filter(key => 
        key.includes('SUPABASE') || 
        key.includes('DEEPSEEK') || 
        key.includes('BOT')
      )
    });

  } catch (error) {
    console.error('Test ENV Error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Unknown error',
      stack: error?.stack
    });
  }
};
