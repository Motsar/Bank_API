const mongoose = require('mongoose');

const accountsSchema = new mongoose.Schema({
    number:{
        type: String,
        required: true,
        max: 11,
        min:11,
        unique: true
    },
    name:{
        type: String,
        required: true,
        min: 2,
        max: 255
    },
    balance:{
        type: Number,
        required: true,
        min: 0
    },
    currency:{
        type: String,
        required: true,
        min: 3,
        max:3,
        default: "EUR"
    },
    userId:{
        type: String,
        required: true,
        min: 6,
        max: 255
    }
})

module.exports = mongoose.model('Accounts', accountsSchema);