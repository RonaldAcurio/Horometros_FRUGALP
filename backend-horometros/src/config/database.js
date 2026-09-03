require('dotenv').config();

const isProduction = 
  process.env.NODE_ENV === 'production' || 
  process.env.DB_HOST?.includes('render.com') || 
  process.env.DB_HOST?.startsWith('dpg-');

const config = {
  username: process.env.DB_USER || 'postgre',
  password: process.env.DB_PASSWORD || process.env.DB_PASWORD || '1234',
  database: process.env.DB_NAME || 'horometros_db',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  dialect: 'postgres',
  logging: false,
  dialectOptions: isProduction ? {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  } : {}
};

module.exports = {
  development: config,
  test: config,
  production: config
};