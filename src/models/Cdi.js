const mongoose = require('mongoose')

const CdiSchema = new mongoose.Schema({
    name:{
        type: String,
        default: 'cdi',
        required: true
    },
    date:{
        type: String,
        required: true
    },
    DT_MONTH:{
        type: String,
        required: true
    },
    Daily_Factor:{
        type: String,
        required: true
    }, 
})

mongoose.model('CDI', CdiSchema)