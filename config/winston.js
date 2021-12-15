const winston = require('winston');
const winstonDaily = require('winston-daily-rotate-file');

const logDir = '/OWNER/LOG/REPORTS';
const {combine, timestamp, printf} = winston.format;
const moment = require('moment');
require('moment-timezone');
moment.tz.setDefault('Asia/Seoul');
// Define log format
const logFormat = printf(info=>{
    return `${info.timestamp} ${info.level} : ${JSON.stringify(info.message, null, 4)}`;
});

/*
* Log Level
* error:0, warn:1, info:2, http:3, verbose:4, debug:5, silly:6
*/
const logger = winston.createLogger({
    format: combine(
        timestamp({
            
            format: moment().format('YYYY-MM-DD HH:mm:ss'),
        }),
        logFormat,
    ),
    transports: [
        // info 레벨 로그를 저장할 파일 설정
        new winstonDaily({
            level: 'info',
            datePattern: 'YYYY-MM-DD',
            dirname: logDir,
            filename: `%DATE%.log`,
            maxfiles: 30, // 30 일치 로그 파일 저장
            zippedArchive: true,
        }),
        new winstonDaily({
            level: 'error',
            datePattern: 'YYYY-MM-DD',
            dirname: logDir+'/error', // error.log 파일은 /logs/error 하위에 저장
            filename: `%DATE%.error.log`,
            maxFiles: 30,
            zippedArchive: true,
        }),
    ]
});

// Production 환경이 아닌 경우(dev 등)
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(), // 색깔 넣어서 출력
            winston.format.simple(), // `${info.level}: ${info.message} JSON.stringify({...rest})` 포맷으로 출력            
            logFormat
        )
    }));
}

module.exports = {
    logger
}