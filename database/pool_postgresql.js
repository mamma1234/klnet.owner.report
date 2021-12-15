const { Pool } = require('pg');
const { logger } = require('../config/winston.js');

const pool = new Pool({
    connectionString:  "postgresql://owner:!ghkwn_20@172.19.1.22:5432/owner",
    max: 30,
    min: 4,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000
});


logger.info("postgresql pool creating...");
//}catch(err){
//    console.error('init error: ' + err.message);
//}
  


module.exports = pool;