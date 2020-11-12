const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    userId:{
        type: String,
        required: true,
        min: 6,
        max: 255
    },
    token:{
        type:String,
        required: true,
        min: 6,
        max: 255
    }

});

module.exports = mongoose.model('Session', sessionSchema);