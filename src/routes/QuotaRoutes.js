const express = require("express")
const axios = require('axios')
const mongoose = require('mongoose')
const Papa = require('papaparse')
const cheerio = require('cheerio')
const multer = require('multer')
const ExcelJS = require('exceljs');
const path = require('path')
const uploadConfig = require('../config/upload')
const fs = require('fs')
const parser = require('csv-parser')

const Quota = mongoose.model('Quota')
const CDI = mongoose.model('CDI')

const router = express.Router()
const upload = multer(uploadConfig)

router.get('/quotas',async(req, res) => {
    const response = await axios.get('http://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/')
        .then(res => {
            const html = res.data
            const cont = cheerio.load(html)
            const results = []
            cont(".odd,.even").each(function(){
                results.push({
                    title: cont(this).find(".indexcolname").text(),
                    date: cont(this).find(".indexcollastmod").text(),
                    link: `http://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/${cont(this).find("a").attr("href")}`
                })
            })
            const result = results[results.length - 2]
            return result
        })
    const { link } = response;
    
    const downloadData = await axios.get(`${link}`)
    
    const results = Papa.parse(downloadData.data, {
        header: true
    });
    
    
    const info =  results.data
    const allDates = []
    info.map((item) => {
        allDates.push( item.DT_COMPTC ) 
    })
    let uniqueDates = [...new Set(allDates)]
    uniqueDates.pop()
    let highDate = uniqueDates[uniqueDates.length - 1]
    uniqueDates.map((date) => {
        if(date > highDate){
            highDate = date
        }
    })
    
    
    const data = []
    info.map((item) => {
        if(item.DT_COMPTC == highDate){
            data.push(item)
        }
    })  
    data.map((item) => {
        delete item.VL_TOTAL, 
        delete item.VL_PATRIM_LIQ
        delete item.CAPTC_DIA
        delete item.RESG_DIA
        delete item.NR_COTST
    })
    
    
    data.map(async(cota) => {
        const { CNPJ_FUNDO, DT_COMPTC, VL_QUOTA } = cota
        
        const newQuota = new Quota({ CNPJ_FUNDO, DT_COMPTC, VL_QUOTA })
        await newQuota.save()
    })
})
router.post('/data', upload.single('CNPJ') ,async(req, res) => {

    let csvData = []
    let totalRent = []
    const contactReadStream = fs.createReadStream(req.file.path);
    
    const parsers = parser({
        headers: true,
        delimiter: ',',
        skip_empty_lines: true,
        from_line: 1,
    });

    const parseCSV = contactReadStream.pipe(parsers);

    parseCSV.on('data', async line => {
        csvData.push(line)
    })
    parseCSV.on('end', async() => {
        if(!Number(csvData[csvData.length - 1].undefined)){
            csvData.pop()
        }
        if(!Number(csvData[0].undefined)){
            csvData.shift()
        }
        csvData.map(async(item) => {
            let CNPJ_FUNDO = item.undefined
            if(CNPJ_FUNDO.length == 15){
                const cnpjFormt = CNPJ_FUNDO.split('')
                cnpjFormt.shift()
                CNPJ_FUNDO = cnpjFormt.join('')
            }
            if (CNPJ_FUNDO.length == 12) {
                const cnpjFormt = CNPJ_FUNDO.split('')
                cnpjFormt.splice(0, 0, '0')
                CNPJ_FUNDO = cnpjFormt.join('')
            }
            if (CNPJ_FUNDO.length == 13) {
                const cnpjFormt = CNPJ_FUNDO.split('')
                cnpjFormt.splice(0, 0, '0')
                CNPJ_FUNDO = cnpjFormt.join('')
            }
            if(CNPJ_FUNDO.length <= 15){
                const cnpjFormt = CNPJ_FUNDO.split('')
                cnpjFormt.splice(12, 0, '-')
                cnpjFormt.splice(8, 0, '/')
                cnpjFormt.splice(5, 0, '.')
                cnpjFormt.splice(2, 0, '.')
                CNPJ_FUNDO = cnpjFormt.join('')
            }

            const quota = await Quota.find({ CNPJ_FUNDO })
                    
            function compare(a, b) {
                const aDate = a.DT_COMPTC;
                const bDate = b.DT_COMPTC;
                
                let comparison = 0; 

                if (aDate > bDate) {
                    comparison = 1;
                } else if (aDate < bDate) {
                    comparison = -1;
                }
                return comparison;
            }

            quota.sort(compare)
            quota.reverse()
            
            let rentabilidade = {CNPJ_FUNDO: null, rentMes: '-', rentAno: '-', rent12M: '-', rent24M: '-', rent36M: '-'}
            
            let date = quota[0].DT_COMPTC.split('-')

            const rentMes = (quota[0].VL_QUOTA / quota[1].VL_QUOTA - 1 )* 100
            rentabilidade.CNPJ_FUNDO = quota[0].CNPJ_FUNDO
            rentabilidade.rentMes = rentMes.toFixed(2)

            let rentAno =  0 
            if (quota[Number(date[1])]) {
                rentAno = (quota[0].VL_QUOTA / quota[Number(date[1])].VL_QUOTA - 1) * 100
                rentabilidade.rentAno = rentAno.toFixed(2)
            }
            
            let rent12M = 0
            if (quota[12]) {
                rent12M = (quota[0].VL_QUOTA / quota[12].VL_QUOTA - 1) * 100
                rentabilidade.rent12M = rent12M.toFixed(2)
            }
            
            let rent24M = 0
            if (quota[24]) {
                rent24M = (quota[0].VL_QUOTA / quota[24].VL_QUOTA - 1) * 100
                rentabilidade.rent24M = rent24M.toFixed(2)
            }
            
            let rent36M = 0
            if (quota[36]) {
                rent36M = (quota[0].VL_QUOTA / quota[36].VL_QUOTA - 1) * 100
                rentabilidade.rent36M = rent36M.toFixed(2)
            }
            
            
            if(!quota){
            return res.status(422).send({ error: 'Invalid password or email'})
            }
            
            totalRent.push(rentabilidade)

            if(csvData[csvData.length - 1].undefined == item.undefined){
                setTimeout(() => {
                    fs.unlink(req.file.path, (err) => {
                        if (err) {
                            console.log(err);
                        }
                    })
                },10)
                
                let cdiRent = {
                    rentMes: '-', rentAno: '-', rent12M: '-', rent24M: '-', rent36M: '-'
                }
                let count = 1
            
                let lastMonth = quota[0].DT_COMPTC.split('-')
                lastMonth.pop()
                
                let last = lastMonth.join('-')
                
                const cdiMes = await CDI.find({ DT_MONTH: last })
                cdiMes.map((item) => {
                    const { Daily_Factor } = item
                    count = count * Daily_Factor 
                })
                count = (count - 1 ) * 100
                cdiRent.rentMes = count.toFixed(2) + '%'
                
                const cdi = await CDI.find({ name: 'cdi' })
                let anoAtual = lastMonth[0] + '-0' +(lastMonth[1] - (lastMonth[1] - 1))
                count = 1
                cdi.map((item) => {
                    if(item.DT_MONTH >= anoAtual && item.DT_MONTH <= last){
                        count = count * item.Daily_Factor 
                    }
                })
                count = (count - 1 ) * 100
                cdiRent.rentAno = count.toFixed(2) + '%'
            
                let rent12M = 0
                anoAtual = last.split('-')
                anoAtual[0] = anoAtual[0] - 1 
                rent12M = anoAtual.join('-')
                count = 1  
                cdi.map((item) => {
                    if(item.DT_MONTH >= rent12M && item.DT_MONTH <= last){
                        count = count * item.Daily_Factor 
                    }
                })
                count = (count - 1 ) * 100
                cdiRent.rent12M = count.toFixed(2) + '%'
            
                anoAtual[0] = anoAtual[0] - 1 
                let rent24M = anoAtual.join('-')
                count = 1  
                cdi.map((item) => {
                    if(item.DT_MONTH >= rent24M && item.DT_MONTH <= last){
                        count = count * item.Daily_Factor 
                    }
                })
                count = (count - 1 ) * 100
                cdiRent.rent24M = count.toFixed(2) + '%'
            
                anoAtual[0] = anoAtual[0] - 1 
                let rent36M = anoAtual.join('-')
                count = 1  
                cdi.map((item) => {
                    if(item.DT_MONTH >= rent36M && item.DT_MONTH <= last){
                        count = count * item.Daily_Factor 
                    }
                })
                count = (count - 1 ) * 100
                cdiRent.rent36M = count.toFixed(2) + '%'
                

                const workbook = new ExcelJS.Workbook()

                workbook.creator = 'CVM Rent';
                workbook.lastModifiedBy = '';
                workbook.created = new Date(Date.now());
                workbook.modified = new Date();
                workbook.lastPrinted = new Date(2016, 9, 27);

                const sheet = workbook.addWorksheet('Rentabilidade')

                sheet.columns = [
                    { header: 'CNPJ_FUNDO', key: 'cnpj', width: 18,  },
                    { header: 'Rentabilidade_Mes', key: 'mes', width: 18 },
                    { header: 'Rentabilidade_Ano', key: 'ano', width: 18 },
                    { header: 'Rentabilidade_12_Meses', key: 'doze', width: 24 },
                    { header: 'Rentabilidade_24_Meses', key: 'vinte', width: 24 },
                    { header: 'Rentabilidade_36_Meses', key: 'trinta', width: 24 },
                    { header: 'CDI_Mes', key: 'cdi_mes', width: 12 },
                    { header: 'CDI_Ano', key: 'cdi_ano', width: 12 },
                    { header: 'CDI_12M', key: 'cdi_12m', width: 12 },
                    { header: 'CDI_24M', key: 'cdi_24m', width: 12 },
                    { header: 'CDI_36M', key: 'cdi_36m', width: 12 },
                ]

                totalRent.map(async(item) => {
                    let cnpj = item.CNPJ_FUNDO
                    const teste = cnpj.split('')
                    teste.splice(15, 1)
                    teste.splice(10, 1)
                    teste.splice(6, 1)
                    teste.splice(2, 1)
                    cnpj = teste.join('')

                    if(totalRent[0].CNPJ_FUNDO == item.CNPJ_FUNDO){
                        sheet.addRow({ 
                            cnpj, 
                            mes: item.rentMes, 
                            ano: item.rentAno, 
                            doze: item.rent12M, 
                            vinte: item.rent24M, 
                            trinta: item.rent36M, 
                            cdi_mes: cdiRent.rentMes,
                            cdi_ano: cdiRent.rentAno,
                            cdi_12m: cdiRent.rent12M,
                            cdi_24m: cdiRent.rent24M,
                            cdi_36m: cdiRent.rent36M,
                        });
                    }else{
                        sheet.addRow({ 
                            cnpj, 
                            mes: item.rentMes, 
                            ano: item.rentAno, 
                            doze: item.rent12M, 
                            vinte: item.rent24M, 
                            trinta: item.rent36M, 
                        });
                    }
                    if(totalRent[totalRent.length - 1].CNPJ_FUNDO == item.CNPJ_FUNDO){
                       
                        let filename = req.file.originalname.split('.')
                        filename.pop()
                        filename.join('')
                        const filePath = path.join(__dirname, '..', '..', 'downloads', `${filename}.xlsx`)
                        
                        await workbook.xlsx.writeFile(path.join(__dirname, '..', '..', 'downloads',`${filename}.xlsx`))
                        
                        res.send(`https://cvm-project.herokuapp.com/files/${filename}.xlsx`)
                        
                        setTimeout(() => {
                            fs.unlink(filePath, (err) => {
                                
                            })
                        },1800000)
                    }
                })
            }
        })
    })
})

router.post('/date',async(req, res) => {

    const { DT_COMPTC } = req.body
    const { CNPJ_FUNDO } = req.body

    const quota = await Quota.find({ CNPJ_FUNDO })
    
    function compare(a, b) {
        const aDate = a.DT_COMPTC;
        const bDate = b.DT_COMPTC;
        
        let comparison = 0; 
        
        if (aDate > bDate) {
            comparison = 1;
        } else if (aDate < bDate) {
            comparison = -1;
        }
        return comparison;
    }
    
    quota.sort(compare)
    quota.reverse()
    
    let cdiRent = {
        rentMes: '-', rentAno: '-', rent12M: '-', rent24M: '-', rent36M: '-'
    }

    let lastMonth = null
    
    let count = 1

    lastMonth = quota[0].DT_COMPTC.split('-')
    lastMonth.pop()
    
    let last = lastMonth.join('-')
    
    const cdiMes = await CDI.find({ DT_MONTH: last })
    cdiMes.map((item) => {
        const { Daily_Factor } = item
        count = count * Daily_Factor 
    })
    count = (count - 1 ) * 100
    cdiRent.rentMes = count.toFixed(2) + '%'
    console.log(cdiMes);
    
    const cdi = await CDI.find({ name: 'cdi' })
    let anoAtual = lastMonth[0] + '-0' +(lastMonth[1] - (lastMonth[1] - 1))
    count = 1
    cdi.map((item) => {
        if(item.DT_MONTH >= anoAtual && item.DT_MONTH <= last){
            count = count * item.Daily_Factor 
        }
    })
    count = (count - 1 ) * 100
    cdiRent.rentAno = count.toFixed(2) + '%'

    let rent12M = 0
    anoAtual = last.split('-')
    anoAtual[0] = anoAtual[0] - 1 
    rent12M = anoAtual.join('-')
    count = 1  
    cdi.map((item) => {
        if(item.DT_MONTH >= rent12M && item.DT_MONTH <= last){
            count = count * item.Daily_Factor 
        }
    })
    count = (count - 1 ) * 100
    cdiRent.rent12M = count.toFixed(2) + '%'

    anoAtual[0] = anoAtual[0] - 1 
    let rent24M = anoAtual.join('-')
    count = 1  
    cdi.map((item) => {
        if(item.DT_MONTH >= rent24M && item.DT_MONTH <= last){
            count = count * item.Daily_Factor 
        }
    })
    count = (count - 1 ) * 100
    cdiRent.rent24M = count.toFixed(2) + '%'

    anoAtual[0] = anoAtual[0] - 1 
    let rent36M = anoAtual.join('-')
    count = 1  
    cdi.map((item) => {
        if(item.DT_MONTH >= rent36M && item.DT_MONTH <= last){
            count = count * item.Daily_Factor 
        }
    })
    count = (count - 1 ) * 100
    cdiRent.rent36M = count.toFixed(2) + '%'
    console.log(cdiRent);
    
    if(!quota){
        return res.status(422).send({ error: 'nao acho a data'})
    }
    return res.json(quota)
})
router.delete('/delete', async(req, res) => {
    const { DT_COMPTC } = req.body

    const cdi = await Quota.find({DT_COMPTC})
    cdi.map(async(item)  => {
        await Quota.findByIdAndDelete(item._id)
    })    
    return res.json(cdi)
})
module.exports = router

