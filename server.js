/*
Jasper Server for NodeJS
(c) 2018 Loable Technologies
Andrew M. Loable
https://loable.tech
*/
const fs = require('fs');
const tmp = require('tmp');
const url = require('url');
const http = require('http');
const cors = require('cors');
const java = require('java');
const path = require('path');
const util = require('util');
const sleep = require('sleep');
const async = require('async');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const vm = this;
const pglog = require('./database/pglog.js');
const { logger } = require('./config/winston.js');
const os = require('os');

app.set('view engine', 'ejs');

// app.use(express.static('public'));

vm.modulePath = path.dirname(__filename); // main directory
vm.libraryPath = path.join(vm.modulePath, 'libs'); // Put jars in lib directory

vm.settings = {
    reports: {},
    drivers: {},
    connections: {}
};

// Add jar to java classpath
function loadJar(file){
    if (path.extname(file) == '.jar'){
        // console.log("Loading: " + file);
        java.classpath.push(file);
    }
}

// Import JasperReports
function importJasperReports(){

};

// Returns the connection identified by the report
function getReportConnection(report){
    var conn = vm.settings.connections[report.connection];
    if (conn){
        // Return Jasper Connection
        return vm.driverManager.getConnectionSync(conn.jdbc, conn.user, conn.password);
    } else {
        logger.error("Connection " + report.connection + " is not registered.");
        // Return Empty Data Source
        return new vm.jasperEmptyDataSource();
    }
};

// Parse Locale String
function parseLocaleString(str){
    var s = str.split(/[_|-]/);
    if (s.length > 1){
        return vm.locale(s[0], s[1]);
    } else {
        return vm.locale(s[0]);
    }
};

// Generate JasperPrint from a report 
function generateJasperPrint(report, file_type){
    logger.info("generateJasperPrint", report);
    try {
        let  jasperPrint = null;
        report.jrxml = report.file_path;
        report.subreports = report.sub_file_path === undefined ? undefined : report.sub_file_path;
        var parameters = new vm.hashMap();
    
        if (report.jrxml){
            // 20201023 api 파라미터로 처리하도록 수정
            // jrxmlLoader = java.callStaticMethodSync("net.sf.jasperreports.engine.xml.JRXmlLoader", "load", path.join(vm.modulePath, report.jrxml));
            jrxmlLoader = java.callStaticMethodSync("net.sf.jasperreports.engine.xml.JRXmlLoader", "load", report.jrxml);
            report.jasper = java.callStaticMethodSync("net.sf.jasperreports.engine.JasperCompileManager", "compileReport", jrxmlLoader);
            if (report.subreports){
                // console.log("subreports detected");
                for(subreport in report.subreports){
                    var obj = report.subreports[subreport];
                    // 20201023 api 파라미터로 처리하도록 수정
                    // objJrxmlLoader = java.callStaticMethodSync("net.sf.jasperreports.engine.xml.JRXmlLoader", "load", path.join(vm.modulePath, obj.jrxml));
                    objJrxmlLoader = java.callStaticMethodSync("net.sf.jasperreports.engine.xml.JRXmlLoader", "load", obj.jrxml);
                    objJasper = java.callStaticMethodSync("net.sf.jasperreports.engine.JasperCompileManager", "compileReport", objJrxmlLoader);
                    // add subreports as parameters. make sure to use parameters for subreport definition
                    parameters.putSync(subreport, objJasper);
                }
            }
        }
    
        var toExports = [];
    
        if (report.jasper){
            var toExport = null;
    
            //process parameters
            if (report.parameters){
                for (var p in report.parameters) {
                    if (p === "REPORT_LOCALE") {
                        report.parameters[p] = parseLocaleString(report.parameters[p]);
                    }
                    parameters.putSync(p, report.parameters[p]);
                }
            }
    
            // Get connection used by report
            var connection = getReportConnection(report);
            jasperPrint = vm.jasperFillManager.fillReportSync(report.jasper, parameters, connection);
            return jasperPrint;
        }
    } catch( exception ) {
        logger.error( "JAPSER Print exception >"+ exception);
        return null;
    } finally {
        logger.info( "JAPSER Print Connection Close");
        if(connection) {
            connection.close();
        }
    }
};

function getFullPathServer(hostname, jasper) {
    let full_path = '';
    // console.log( hostname, ">>>>",hostname.indexOf( "localhost" ) );
    if( hostname ) {
        if( hostname.indexOf( "localhost" ) === 0 ) {
            // 로컬 서버에서 테스트 하는 경우
            full_path = '/DATA/KLNET/OWNER/REPORTS/'+jasper.file_path+'/'+jasper.file_id;
        } else {
            // 운영 및 테스트 서버에서 처리하는 경우
            full_path = '/OWNER/REPORTS/'+jasper.file_path+'/'+jasper.file_id;
        }
    }
    return full_path;
}

// Generate PDF From JasperPrint
function generatePDF(report){
    logger.info("generatePDF : "+ report.system_id + " : "+ report.user_id + " : " + report.file_id  );
    var tmpFile = tmp.fileSync();
    var outputFile = tmpFile.name + ".pdf";
    var jasperPrint = generateJasperPrint(report, 'pdf');
    if (jasperPrint){
        var jasperReportsContext = java.callStaticMethodSync("net.sf.jasperreports.engine.DefaultJasperReportsContext", "getInstance");
        var exporter = new vm.jasperPdfExporter(jasperReportsContext);
        exporter.setExporterInputSync(new vm.simpleExporterInput(jasperPrint));
        exporter.setExporterOutputSync(new vm.simpleOutputStreamExporterOutput(outputFile));
        exporter.exportReportSync();
    
        var toStream = fs.readFileSync(outputFile);
        fs.unlinkSync(outputFile);
        return toStream; 
    }
    return null;
};

// Generate HTML From JasperPrint
function generateHTML(report){
    logger.info("generateHTML : "+ report.system_id + " : "+ report.user_id + " : " + report.file_id  );
    var tmpFile = tmp.fileSync();
    var outputFile = tmpFile.name + ".html";
    var jasperPrint = generateJasperPrint(report, 'html');
    if (jasperPrint){
        var jasperReportsContext = java.callStaticMethodSync("net.sf.jasperreports.engine.DefaultJasperReportsContext", "getInstance");
        var exporter = new vm.jasperHtmlExporter(jasperReportsContext);
        exporter.setExporterInputSync(new vm.simpleExporterInput(jasperPrint));
        exporter.setExporterOutputSync(new vm.simpleHtmlExporterOutput(outputFile));
        exporter.exportReportSync();
    
        var toStream = fs.readFileSync(outputFile);
        fs.unlinkSync(outputFile);
        return toStream; 
    }
    return null;
};

// Generate RTF From JasperPrint
function generateRTF(report){
    logger.info("generateRTF : "+ report.system_id + " : "+ report.user_id + " : " + report.file_id  );
    var tmpFile = tmp.fileSync();
    var outputFile = tmpFile.name + ".rtf";
    var jasperPrint = generateJasperPrint(report, 'rtf');
    if (jasperPrint){
        var jasperReportsContext = java.callStaticMethodSync("net.sf.jasperreports.engine.DefaultJasperReportsContext", "getInstance");
        var exporter = new vm.jasperRtfExporter(jasperReportsContext);
        exporter.setExporterInputSync(new vm.simpleExporterInput(jasperPrint));
        exporter.setExporterOutputSync(new vm.simpleWriterExporterOutput(outputFile));
        exporter.exportReportSync();
    
        var toStream = fs.readFileSync(outputFile);
        fs.unlinkSync(outputFile);
        return toStream; 
    }
    return null;
};

// Generate CSV From JasperPrint
function generateCSV(report){
    logger.info("generateCSV : "+ report.system_id + " : "+ report.user_id + " : " + report.file_id  );
    var tmpFile = tmp.fileSync();
    var outputFile = tmpFile.name + ".csv";
    var jasperPrint = generateJasperPrint(report, 'csv');
    if (jasperPrint){
        var jasperReportsContext = java.callStaticMethodSync("net.sf.jasperreports.engine.DefaultJasperReportsContext", "getInstance");
        var exporter = new vm.jasperCsvExporter(jasperReportsContext);
        exporter.setExporterInputSync(new vm.simpleExporterInput(jasperPrint));
        exporter.setExporterOutputSync(new vm.simpleWriterExporterOutput(outputFile));
        exporter.exportReportSync();
    
        var toStream = fs.readFileSync(outputFile);
        fs.unlinkSync(outputFile);
        return toStream; 
    }
    return null;
};

// Generate DocX From JasperPrint
function generateDOCX(report){
    logger.info("generateDOCX : "+ report.system_id + " : "+ report.user_id + " : " + report.file_id  );
    var tmpFile = tmp.fileSync();
    var outputFile = tmpFile.name + ".docx";
    var jasperPrint = generateJasperPrint(report, 'docx');
    if (jasperPrint){
        var jasperReportsContext = java.callStaticMethodSync("net.sf.jasperreports.engine.DefaultJasperReportsContext", "getInstance");
        var exporter = new vm.jasperDocxExporter(jasperReportsContext);
        exporter.setExporterInputSync(new vm.simpleExporterInput(jasperPrint));
        exporter.setExporterOutputSync(new vm.simpleOutputStreamExporterOutput(outputFile));
        exporter.exportReportSync();
    
        var toStream = fs.readFileSync(outputFile);
        fs.unlinkSync(outputFile);
        return toStream; 
    }
    return null;
};

// Generate PptX From JasperPrint
function generatePPTX(report){
    logger.info("generatePPTX : "+ report.system_id + " : "+ report.user_id + " : " + report.file_id  );
    var tmpFile = tmp.fileSync();
    var outputFile = tmpFile.name + ".pptx";
    var jasperPrint = generateJasperPrint(report, 'pptx');
    if (jasperPrint){
        var jasperReportsContext = java.callStaticMethodSync("net.sf.jasperreports.engine.DefaultJasperReportsContext", "getInstance");
        var exporter = new vm.jasperPptxExporter(jasperReportsContext);
        exporter.setExporterInputSync(new vm.simpleExporterInput(jasperPrint));
        exporter.setExporterOutputSync(new vm.simpleOutputStreamExporterOutput(outputFile));
        exporter.exportReportSync();
    
        var toStream = fs.readFileSync(outputFile);
        fs.unlinkSync(outputFile);
        return toStream; 
    }
    return null;
};

// Generate XlsX From JasperPrint
function generateXLSX(report){
    logger.info("generateXLSX : "+ report.system_id + " : "+ report.user_id + " : " + report.file_id  );
    var tmpFile = tmp.fileSync();
    var outputFile = tmpFile.name + ".xls";
    var jasperPrint = generateJasperPrint(report, 'xlsx');
    if (jasperPrint){
        var jasperReportsContext = java.callStaticMethodSync("net.sf.jasperreports.engine.DefaultJasperReportsContext", "getInstance");
        var exporter = new vm.jasperXlsxExporter(jasperReportsContext);
        exporter.setExporterInputSync(new vm.simpleExporterInput(jasperPrint));
        exporter.setExporterOutputSync(new vm.simpleOutputStreamExporterOutput(outputFile));
        exporter.exportReportSync();
    
        var toStream = fs.readFileSync(outputFile);
        fs.unlinkSync(outputFile);
        return toStream; 
    }
    return null;
};

// Generate ODT From JasperPrint
function generateODT(report){
    logger.info("generateODT : "+ report.system_id + " : "+ report.user_id + " : " + report.file_id  );
    var tmpFile = tmp.fileSync();
    var outputFile = tmpFile.name + ".odt";
    var jasperPrint = generateJasperPrint(report, 'odt');
    if (jasperPrint){
        var jasperReportsContext = java.callStaticMethodSync("net.sf.jasperreports.engine.DefaultJasperReportsContext", "getInstance");
        var exporter = new vm.jasperOdtExporter(jasperReportsContext);
        exporter.setExporterInputSync(new vm.simpleExporterInput(jasperPrint));
        exporter.setExporterOutputSync(new vm.simpleOutputStreamExporterOutput(outputFile));
        exporter.exportReportSync();
    
        var toStream = fs.readFileSync(outputFile);
        fs.unlinkSync(outputFile);
        return toStream; 
    }
    return null;
};

// Start Of Process
async.auto({
    getSettings: function(callback){
        // console.log("get settings");
        vm.settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
        callback();
    },
    getJarsFromLib: ['getSettings', function(results, callback){
        var dir = vm.libraryPath;
        // console.log("get jars from " + dir);
        var files = fs.readdirSync(dir);
        for (var file in files){
            file = path.join(dir, files[file]);
            var stat = fs.statSync(file);
            if (stat && stat.isDirectory()){
                // directory found, do not process
                logger.info("found subdirectory : "+ file );
            } else {
                logger.info("found file " + file);
                // Load Jar
                loadJar(file);
            }
        }       
        callback();
    }],
    loadSQLDrivers: ['getJarsFromLib', function(results, callback){    
        logger.info("load sql drivers");
        var classLoader = java.callStaticMethodSync("java.lang.ClassLoader", "getSystemClassLoader");
        if (vm.settings.drivers){
            for (var name in vm.settings.drivers){
                var driver = vm.settings.drivers[name];            
                var file = path.join(vm.modulePath, driver.path);
                loadJar(file);
                classLoader.loadClassSync(driver.class).newInstanceSync();
            }        
        }
        callback();
    }],
    importJasper: ['loadSQLDrivers', function(results, callback){
        logger.info("import jasper");        
        vm.driverManager = java.import("java.sql.DriverManager");
        vm.hashMap = java.import("java.util.HashMap");
        vm.locale = java.import("java.util.Locale");
        vm.byteAraryInputStream = java.import("java.io.ByteArrayInputStream");
        vm.jasperEmptyDataSource = java.import("net.sf.jasperreports.engine.JREmptyDataSource");
        vm.jasperCompileManager = java.import("net.sf.jasperreports.engine.JasperCompileManager");
        vm.jasperFillManager = java.import("net.sf.jasperreports.engine.JasperFillManager");
        vm.jasperExportManager = java.import("net.sf.jasperreports.engine.JasperExportManager");
        vm.jasperPdfExporter = java.import("net.sf.jasperreports.engine.export.JRPdfExporter");
        vm.jasperHtmlExporter = java.import("net.sf.jasperreports.engine.export.HtmlExporter");
        vm.jasperRtfExporter = java.import("net.sf.jasperreports.engine.export.JRRtfExporter");
        vm.jasperCsvExporter = java.import("net.sf.jasperreports.engine.export.JRCsvExporter");
        vm.jasperDocxExporter = java.import("net.sf.jasperreports.engine.export.ooxml.JRDocxExporter");
        vm.jasperPptxExporter = java.import("net.sf.jasperreports.engine.export.ooxml.JRPptxExporter");
        vm.jasperXlsxExporter = java.import("net.sf.jasperreports.engine.export.ooxml.JRXlsxExporter");
        vm.jasperOdtExporter = java.import("net.sf.jasperreports.engine.export.oasis.JROdtExporter");
        vm.jasperJsonExporter = java.import("net.sf.jasperreports.engine.export.JsonExporter");
        vm.simpleExporterInput = java.import("net.sf.jasperreports.export.SimpleExporterInput");
        vm.simpleOutputStreamExporterOutput = java.import("net.sf.jasperreports.export.SimpleOutputStreamExporterOutput");
        vm.simpleHtmlExporterOutput = java.import("net.sf.jasperreports.export.SimpleHtmlExporterOutput");
        vm.simpleWriterExporterOutput = java.import("net.sf.jasperreports.export.SimpleWriterExporterOutput");
        vm.jasperXmlLoader = java.import("net.sf.jasperreports.engine.xml.JRXmlLoader")
        callback();
    }]
},
function(error, results) {
    logger.info("start express");
    // Start of Express     
    app.use(cors({ origin: true }));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({extended: false}));

    app.post("/report/generate_pdf", function(req, res){
        
        // console.log(req.headers.host);
        const report = req.body;
        // console.log(report);
        // file_path 처리
        report.file_path = getFullPathServer( req.headers.host, report );
        // console.log(report);
        if (report){
            try{
                const obj = generatePDF(report);
                if ( obj ) {
                    // 이력생성
                    report.success_yn = 'Y';
                    report.err_log = null;
                    pglog.insertLogger(report);
    
                    const today = new Date();
                    const cur_tiems = today.getFullYear()+''+today.getMonth()+''+today.getDate()+''+today.getDay()+''+today.getHours()+''+today.getMinutes()+''+today.getMilliseconds();
                    const pdf_name = report.name+'_'+cur_tiems+'.pdf';
                    res.setHeader('Content-Type', 'application/pdf');
                    res.setHeader('Content-Length', obj.length);
                    res.setHeader('Content-Disposition','attachment; filename='+pdf_name);
                    res.setHeader("Access-Control-Allow-Origin", "*");
                    res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
                    res.setHeader("Content-Type", "application/force-download");
                    res.setHeader("Content-Transfer-Encoding", "binary");
                    res.send(obj);
                } else {
                    report.success_yn = 'N';
                    report.err_log = 'PDF Exception';
                    pglog.insertLogger(report);
    
                    // logger.error( "PDF Exception > ",exception );
                    res.status(500).json({ errorcode: 500, error: '시스템 오류 입니다. 관리자에게 문의하세요.' });
                }
            } catch (exception) {
                report.success_yn = 'N';
                report.err_log = 'PDF Exception';
                pglog.insertLogger(report);

                logger.error( "PDF Exception > ", exception );
                res.status(500).json({ errorcode: 500, error: exception.stack });
            }
        } else {
            report.success_yn = 'N';
            report.err_log = 'PDF Exception';
            pglog.insertLogger(report);

            res.status(500).json({ errorcode: 500, error: '시스템 오류 입니다. 관리자에게 문의하세요.' });
        }
        
    });
    app.post("/report/generate_html", function(req, res){
        const report = req.body;

        // file_path 처리
        report.file_path = getFullPathServer( req.headers.host, report );

        if (report){
            // console.log(report);
            try{
                const obj = generateHTML(report);
                if(obj) {
                    res.setHeader('Content-Disposition', 'attachment; filename=' + report.name + ".html");
                    res.contentType("text/html");
                    res.send(obj);

                } else {
                    report.success_yn = 'N';
                    report.err_log = 'HTML Exception';
                    pglog.insertLogger(report);

                    res.status(500).json({ errorcode: 500, error: '시스템 오류 입니다. 관리자에게 문의하세요.' });
                }
            } catch (exception) {
                report.success_yn = 'N';
                report.err_log = 'HTML Exception';
                pglog.insertLogger(report);
                logger.error( "HTML Exception > ", exception );
                res.status(500).json({ errorcode: 500, error: exception.stack });
            }
        } else {
            report.success_yn = 'N';
            report.err_log = 'HTML Exception';
            pglog.insertLogger(report);

            res.status(500).json({ errorcode: 500, error: '시스템 오류 입니다. 관리자에게 문의하세요.' });
        }
        
    });
    app.post("/report/generate_rtf", function(req, res){
        const report = req.body;

        // file_path 처리
        report.file_path = getFullPathServer( req.headers.host, report );

        if (report){
            // console.log(report);
            try {
                const obj = generateRTF(report); 
                if( obj ) {
                    res.setHeader('Content-Disposition', 'attachment; filename=' + report.name + ".rtf");
                    res.contentType("application/rtf");
                    res.send(obj);
                } else {
                    report.success_yn = 'N';
                    report.err_log = 'RTF Exception';
                    pglog.insertLogger(report);

                    res.status(500).json({ errorcode: 500, error: '시스템 오류 입니다. 관리자에게 문의하세요.' });
                }
            } catch (exception) {
                report.success_yn = 'N';
                report.err_log = 'RTF Exception';
                pglog.insertLogger(report);
                logger.error( "RTF Exception > ", exception );
                res.status(500).json({ errorcode: 500, error: exception.stack });
            }
        } else {
            report.success_yn = 'N';
            report.err_log = 'RTF Exception';
            pglog.insertLogger(report);
            res.status(500).json({ errorcode: 500, error: '시스템 오류 입니다. 관리자에게 문의하세요.' });
        }
        
    });
    app.post("/report/generate_csv", function(req, res){
        const report = req.body;

        // file_path 처리
        report.file_path = getFullPathServer( req.headers.host, report );

        if (report){
            
            try{
                const obj = generateCSV(report);
                if( obj ) {
                    res.setHeader('Content-Disposition', 'attachment; filename=' + report.name + ".csv");
                    res.contentType("application/rtf");
                    res.send(obj);
                } else {
                    report.success_yn = 'N';
                    report.err_log = 'CSV Exception';
                    pglog.insertLogger(report);
                    logger.error( "CSV Exception > ",exception );
                    res.status(500).json({ errorcode: 500, error: '시스템 오류 입니다. 관리자에게 문의하세요.' });
                }
            } catch (exception) {
                report.success_yn = 'N';
                report.err_log = 'CSV Exception';
                pglog.insertLogger(report);

                res.status(500).json({ errorcode: 500, error: exception.stack });
            }
        } else {
            report.success_yn = 'N';
            report.err_log = 'CSV Exception';
            pglog.insertLogger(report);
            logger.error( "CSV Exception > ", exception );
            res.status(500).json({ errorcode: 500, error: '시스템 오류 입니다. 관리자에게 문의하세요.' });
        }        
    });
    app.post("/report/generate_docx", function(req, res){
        const report = req.body;

        // file_path 처리
        report.file_path = getFullPathServer( req.headers.host, report );

        if (report){
            try{
                const obj = generateDOCX(report);
                if( obje ) {
                    res.setHeader('Content-Disposition', 'attachment; filename=' + report.name + ".docx");
                    res.contentType("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
                    res.send(obj);
                } else {
                    report.success_yn = 'N';
                    report.err_log = 'DOCX Exception';
                    pglog.insertLogger(report);

                    res.status(500).json({ errorcode: 500, error: '시스템 오류 입니다. 관리자에게 문의하세요.' });
                }
            } catch (exception) {
                report.success_yn = 'N';
                report.err_log = 'DOCX Exception';
                pglog.insertLogger(report);
                logger.error( "DOCX Exception > ", exception );
                res.status(500).json({ errorcode: 500, error: exception.stack });
            }
        } else {
            report.success_yn = 'N';
            report.err_log = 'DOCX Exception';
            pglog.insertLogger(report);
            res.status(500).json({ errorcode: 500, error: '시스템 오류 입니다. 관리자에게 문의하세요.' });
        }
        
    });
    app.post("/report/generate_pptx", function(req, res){
        const report = req.body;

        // file_path 처리
        report.file_path = getFullPathServer( req.headers.host, report );

        if (report){
            try {
                const obj = generatePPTX(report);            
                if( obj ) {
                    res.setHeader('Content-Disposition', 'attachment; filename=' + report.name + ".pptx");
                    res.contentType("application/vnd.openxmlformats-officedocument.presentationml.presentation");
                    res.send(obj);
                } else {
                    report.success_yn = 'N';
                    report.err_log = 'PPTX Exception';
                    pglog.insertLogger(report);

                    res.status(500).json({ errorcode: 500, error: '시스템 오류 입니다. 관리자에게 문의하세요.' });
                }
            } catch (exception) {
                report.success_yn = 'N';
                report.err_log = 'PPTX Exception';
                pglog.insertLogger(report);
                logger.error( "PPTX Exception > ", exception );
                res.status(500).json({ errorcode: 500, error: exception.stack });
            }
        } else {
            report.success_yn = 'N';
            report.err_log = 'PPTX Exception';
            pglog.insertLogger(report);
            res.status(500).json({ errorcode: 500, error: '시스템 오류 입니다. 관리자에게 문의하세요.' });
        }
        
    });
    app.post("/report/generate_xlsx", function(req, res){
        const report = req.body;

        // file_path 처리
        report.file_path = getFullPathServer( req.headers.host, report );

        if (report){
            try {
                const obj = generateXLSX(report);
                if( obj ) {
                    res.setHeader('Content-Disposition', 'attachment; filename=' + report.name + ".xlsx");
                    res.contentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
                    res.send(obj);
                } else {
                    report.success_yn = 'N';
                    report.err_log = 'RTF Exception';
                    pglog.insertLogger(report);

                    res.status(500).json({ errorcode: 500, error: '시스템 오류 입니다. 관리자에게 문의하세요.' });
                }
            } catch (exception) {
                report.success_yn = 'N';
                report.err_log = 'RTF Exception';
                pglog.insertLogger(report);
                logger.error( "RTF Exception > ", exception );
                res.status(500).json({ errorcode: 500, error: exception.stack });
            }
        } else {
            report.success_yn = 'N';
            report.err_log = 'RTF Exception';
            pglog.insertLogger(report);
            res.status(500).json({ errorcode: 500, error: '시스템 오류 입니다. 관리자에게 문의하세요.' });
        }
        
    });
    app.post("/report/generate_odt", function(req, res){
        const report = req.body;

        // file_path 처리
        report.file_path = getFullPathServer( req.headers.host, report );

        if (report){
            try{
                const obj = generateODT(report);
                if( obj ) {
                    res.setHeader('Content-Disposition', 'attachment; filename=' + report.name + ".odt");
                    res.contentType("application/vnd.oasis.opendocument.text");
                    res.send(obj);
                } else {
                    report.success_yn = 'N';
                    report.err_log = 'ODT Exception';
                    pglog.insertLogger(report);

                    res.status(500).json({ errorcode: 500, error: '시스템 오류 입니다. 관리자에게 문의하세요.' });
                }
            } catch (exception) {
                report.success_yn = 'N';
                report.err_log = 'ODT Exception';
                pglog.insertLogger(report);
                logger.error( "ODT Exception > ", exception );
                res.status(500).json({ errorcode: 500, error: exception.stack });
            }
        } else {
            report.success_yn = 'N';
            report.err_log = 'ODT Exception';
            pglog.insertLogger(report);
            res.status(500).json({ errorcode: 500, error: '시스템 오류 입니다. 관리자에게 문의하세요.' });
        }
        
    });

    // test page
    const mainHtml = `
    <!doctype html>
    <html>
        <script>
        function getPdf() {
            alert("asdfasdfsdf");
        }
        </script>
        <head>
            <title>jasper report test page</title>
            <meta charset="utf-8">
        </head>
        <body>
            <form action="http://localhost:5007/report/carrier" method="post">
                <h1>사용하지 마세요</h1>
                <p><input type='text' name='line_code' placeholder='line_code' value="KMD" /></p>
                <p><input type='text' name='carrier_code' placeholder='carrier_code' value="KMTC" /></p>
                <p><input type='text' name='user_no' placeholder='carrier_code' value="M00006" /></p>
                <p><input type='submit'/></p>
            </form>
            <form action="http://localhost:5007/report/bl_docu" method="post">
                <h1>사용하지 마세요</h1>
                <p><input type='text' name='req_seq' placeholder='line_code' value="20200415201350KMD2120" /></p>
                <p><input type='text' name='bl_bkg' placeholder='carrier_code' value="KMTCSHK4940650" /></p>
                <p><input type='text' name='user_no' placeholder='carrier_code' value="M00006" /></p>
                <p><input type='submit'/></p>
            </form>
            <p><input type='button' value="PDF" onClick="getPdf()"/></p>
        </body>
    </html>
    `;
    
    app.get('/report/index.html', (req, res) => {
        res.redirect('/report');
    });

    app.get('/report/index', (req, res) => {
        res.redirect('/report');
    });
    
    // app.get("/report", function(req, res){

    //     const _url = req.url;
    //     // const hostname = url.parse(_url, true).hostname;
    //     const hostname = req.get('host');
    //     // console.log(hostname, req.get('host'));
    //     let reportFilePath = '';
    //     if( hostname == 'localhost') {
    //         reportFilePath = path.join(path.sep+'DATA','KLNET','OWNER','REPORTS');
    //     } else if ( hostname == 'dev.plismplus.com' ) {
    //         reportFilePath = path.join(path.sep+'OWNER','REPORTS');
    //     } else if ( hostname == 'www.plismplus.com' ) {
    //         reportFilePath = path.join(path.sep+'OWNER','REPORTS');
    //     } else {
    //         reportFilePath = path.join(path.sep+'OWNER','REPORTS'); 
    //     }

    //     const files = fs.readdirSync(reportFilePath);
    //     let list = []
    //     for( var i=0; i<files.length; i++ ) {
    //         var folder = files[i];
    //         let jrxmFilePath = path.join(reportFilePath,folder);
    //         let jrxmlFiles = fs.readdirSync(jrxmFilePath);
    //         let params = {}
    //         params.folder = folder;
    //         // .jrxml 확장자인것만 추출
    //         for( var m=0; m<jrxmlFiles.length; m++) {
    //             let jrxmlFile = jrxmlFiles[m];
    //             let suffix = jrxmlFile.substr(jrxmlFile.length-6, jrxmlFile.length);
    //             if( '.jrxml' === suffix ) {
    //                 params.jrxml = jrxmlFile;
    //             }
    //         }
    //         list.push(params);
    //     }
    //     // console.log(list);
    //     // res.sendFile(path.join(__dirname,'views','jquery-1.10.2.js'));
    //     res.render('index', {rows:list}); 
        
    // });



    app.get("/report", function(req, res){

        const _url = req.url;
        // const hostname = url.parse(_url, true).hostname;
        const hostname = req.get('host');
        // console.log(hostname, req.get('host'));
        let reportFilePath = '';
        // console.log("11111")
        if( hostname == 'localhost:5007') {
            reportFilePath = path.join(path.sep+'DATA','KLNET','OWNER','REPORTS');
        } else if ( hostname == 'dev.plismplus.com' ) {
            reportFilePath = path.join(path.sep+'OWNER','REPORTS');
        } else if ( hostname == 'www.plismplus.com' ) {
            reportFilePath = path.join(path.sep+'OWNER','REPORTS');
        } else {
            reportFilePath = path.join(path.sep+'OWNER','REPORTS'); 
        }
        // console.log("222222")
        const files = fs.readdirSync(reportFilePath);
        let list = []
        for( var i=0; i<files.length; i++ ) {
            var folder = files[i];
            let jrxmFilePath = path.join(reportFilePath,folder);
            let jrxmlFiles = fs.readdirSync(jrxmFilePath);
            let params = {}
            params.folder = folder;
            // .jrxml 확장자인것만 추출
            for( var m=0; m<jrxmlFiles.length; m++) {
                let jrxmlFile = jrxmlFiles[m];
                let suffix = jrxmlFile.substr(jrxmlFile.length-6, jrxmlFile.length);
                if( '.jrxml' === suffix ) {
                    params.jrxml = jrxmlFile;
                }
            }
            list.push(params);
        }
        // console.log(list);
        // res.sendFile(path.join(__dirname,'views','jquery-1.10.2.js'));
        res.render('index', {rows:list}); 
        
    });
    

    // Viewr
    app.get("/report/viewerHTML", function(req, res){

        const report = {
            system_id: 'plismplus',
            user_id: 'M000008',
            file_type: 'html',
            // file_id:'SEAWAYBILL.jrxml',
            // file_path: 'TEST_REVIEW',
            file_id:'SEAWAYBILL_server.jrxml',
            file_path: 'TEST_0222',
            name:'TEST_20201111',
            connection: 'pgsql',
            parameters: {
                'user_no':'M000002',
                'bkg_date':'20210120',
                'bkg_no':'2021012000001'
            }
        }
        res.render('viewerHTML', {report:report});
        
    });

    // Viewr
    app.get("/report/reportViewer", function(req, res){
        const query = req.query;
        if( query ) {
            const report = {
                system_id:  query.system_id,
                user_id:    query.user_id,
                file_type:  query.file_type,
                file_id:    query.file_id+'.jrxml',
                file_path:  query.file_path,
                name:       query.name,
                connection: query.connection,
                parameters: JSON.parse(query.parameters)
            }
            logger.info(report);
            res.render('viewerPDF', {report:report});
        }
    });

    // Viewr
    app.post("/report/reportViewer", function(req, res){
        let body = req.body;
        if( body ) {
            const report = {
                system_id:  req.body.system_id,
                user_id:    req.body.user_id,
                file_type:  req.body.file_type,
                file_id:    req.body.file_id+'.jrxml',
                file_path:  req.body.file_path,
                name:       req.body.name,
                connection: req.body.connection,
                parameters: JSON.parse(req.body.parameters)
            }
            logger.info(report);
            res.render('viewerPDF', {report:report});
        }
    });

    const port = process.env.PORT || 5007;
    app.listen(port, () => logger.info(`Listening on port ${port}`));

    //js
    app.use('/js', express.static(path.join(__dirname,'node_modules/bootstrap/dist/js')));
    // css
    app.use('/css', express.static(path.join(__dirname,'node_modules/bootstrap/dist/css')));
    app.use('/static',express.static(path.join(__dirname,'public')));
    app.use('/fonts',express.static(path.join(__dirname,'public/fonts')));
    app.use('/image',express.static(path.join(__dirname,'public/svg')));
    app.use('/report/image',express.static(path.join(__dirname,'report/svg')));
    app.use('/report/js',express.static(path.join(__dirname,'report/js')));
    app.use('/report/css',express.static(path.join(__dirname,'report/css')));
    
});




