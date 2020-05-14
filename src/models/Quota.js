const mongoose = require('mongoose')

const QuotaSchema = new mongoose.Schema({
    CNPJ_FUNDO:{
        type: String,
        required: true
    },
    DT_COMPTC:{
        type: String,
        required: true
    }, 
    VL_QUOTA:{
        type: String,
        required: true
    }
})

mongoose.model('Quota', QuotaSchema)