'use strict';

const pgsqlPool = require("./pool.js").pgsqlPool;
const { logger } = require('../config/winston.js');

const insertLogger = (report) => {
    
    const sql = {
        text: ` INSERT INTO public.own_report_log
(log_seq, system_id, user_id, file_type, file_id, succeess_yn, error_log, insert_date) 
VALUES( to_char( now(), 'yyyymmddhh24miss' )||'RPT'||lpad(cast( nextval('own_report_seq') as varchar),4,'0') 
, $1, $2, $3, $4, $5, $6, now()) `,
        values: [
            report.system_id,
            report.user_id,
            report.file_type,
            report.file_id,
            report.success_yn,
            report.err_log
        ],
    }
    // console.log( sql );
    pgsqlPool.connect(function(err,conn,release) {
        if(err){
            logger.error('DB Insert Exception'+ err)
        } else  {
            conn.query(sql, function(err,result){
                if( err ) {
                    logger.error(err)
                }
                if(result) {
                    logger.info('DB Inserted');
                }
            });
            release();
        }

    });
}

module.exports = {
    insertLogger
}