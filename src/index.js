require('./models/Quota')
require('./models/Cdi')

const express = require('express')
const mongoose = require('mongoose')
const path = require('path')
const cors = require('cors')
const quotaRoutes = require('./routes/QuotaRoutes')
const cdiRoutes = require('./routes/CdiRoutes')

const app = express()

app.use(cors())
app.use('/files', express.static(path.resolve(__dirname, '..', 'downloads')))
app.use(express.json())
app.use(cdiRoutes)
app.use(quotaRoutes)

const uri = "mongodb+srv://admin:4BLBC9zB7xT3bz7Y@cvm-data-78tbt.gcp.mongodb.net/test?retryWrites=true&w=majority"
mongoose.connect(uri,{
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
})

mongoose.connection.on('error', (err) => {
    console.log("connected" + err);
})

app.listen(process.env.PORT || 3005)
