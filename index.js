const express = require('express');
const app = express();
const mongoose = require('mongoose');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load('./docs/api.yaml');
const path = require('path')
const { processTransactions } = require(path.resolve(__dirname, "./middlewares.js"));
require('dotenv').config();

//Import Routes
const authRoute = require('./routes/users');
const userInfoRoute = require('./routes/accounts');
const transferRoute = require('./routes/transactions')



//Connect to database
mongoose.connect(process.env.DB_CONNECT,
    {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        useCreateIndex: true
    },
    () => {
        console.log('connected to db')
    });

//Middleware
app.use(express.json());
//Route middlewares
app.use('/', authRoute);
app.use('/accounts', userInfoRoute);
app.use('/transactions', transferRoute);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

processTransactions();

app.listen(process.env.PORT, () => console.log('Server Up an running!'));