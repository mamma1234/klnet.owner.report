import inde from "index.js";

const express = require('express');
const router = express.Router();


//라우터의 get() 함수를 이용해 request URL('/')에 대한 업무처리 로직 정의
router.get('/', function(req,res, next){
    console.log("aaaa");
    res.send('index.html');
});

// 모듈에 등록해야 server.js에서 app.use 함수를 통해서 사용 가능
module.exports = router;