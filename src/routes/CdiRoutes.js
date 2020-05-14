const express = require("express")
const axios = require('axios')
const mongoose = require('mongoose')
const Papa = require('papaparse')
const multer = require('multer')
const path = require('path')
const uploadConfig = require('../config/upload')
const fs = require('fs')
const parser = require('csv-parser')

const CDI = mongoose.model('CDI')

const router = express.Router()
const upload = multer(uploadConfig)

router.post('/cdi',  upload.single('CDI') ,async(req, res) => {
    const contactReadStream = fs.createReadStream(req.file.path);
    let cdiFile = []
    const parsers = parser({
        delimiter: ',',
        skip_empty_lines: true,
        from_line: 1,
    });

    const parseCSV = contactReadStream.pipe(parsers);

    parseCSV.on('data', async line => {
        cdiFile.push(line)
    })
    parseCSV.on('end', async() => {
        cdiFile.map(async (item) => {
            let { Daily_Factor, DT_COMPTC } = item
            let date = DT_COMPTC
            let dateformat = date.split('/')

            function array_move(arr, old_index, new_index) {
                if (new_index >= arr.length) {
                    const k = new_index - arr.length + 1;
                    while (k--) {
                        arr.push(undefined);
                    }
                }
                arr.splice(new_index, 0, arr.splice(old_index, 1)[0]);
            };
            
            array_move(dateformat, 2, 0)
            array_move(dateformat, 2, 1)

            let DT_MONTH = dateformat[0] + '-' + dateformat[1]

            date = dateformat.join('-')

            if (Daily_Factor.length <= 9) {
                let daily = Daily_Factor.split('')
                daily.splice([daily.length], 0, '0')
                Daily_Factor = daily.join('')
            }

            const newCdi = new CDI({ Daily_Factor, date, DT_MONTH })
            await newCdi.save()

            if(cdiFile[cdiFile.length - 1].DT_COMPTC == item.DT_COMPTC){
                setTimeout(() => {
                    fs.unlink(req.file.path, (err) => {
                        if (err) {
                            console.log(err);
                        }
                    })
                },10)
            }
        })
        res.send('foi')
    })
})



router.get('/cdi',async(req, res) => {
    const response = await axios.get('https://api.hgbrasil.com/finance/taxes?key=e8412fca')
    const { date, daily_factor: Daily_Factor } = response.data.results[0]

    let dateformat = date.split('-')
    let DT_MONTH = dateformat[0] + '-' + dateformat[1]

    if (Daily_Factor.length <= 9) {
        let daily = Daily_Factor.split('')
        daily.splice([daily.length], 0, '0')
        Daily_Factor = daily.join('')
    }
    
    const cdi = await CDI.findOne({ date })
    if (!cdi) {
        const newCdi = new CDI({ Daily_Factor, date, DT_MONTH })
        await newCdi.save()
    }
        
    return res.status(200).send('finish')

})
module.exports = router