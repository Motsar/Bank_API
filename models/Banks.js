const mongoose = require('mongoose')

var validateUrl = function(url) {
    var re = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[-;:&=\+\$,\w]+@)?[A-Za-z0-9.-]+(:[0-9]+)?|(?:www.|[-;:&=\+\$,\w]+@)[A-Za-z0-9.-]+)((?:\/[\+~%\/.\w-_]*)?\??(?:[-\+=&;%@.\w_]*)#?(?:[\w]*))?)/;
    return re.test(url)
};

module.exports = mongoose.model('Bank', new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    apiKey: {
        type: String,
        required: true
    },
    transactionUrl: {
        type: String,
        required: true,
        validate: validateUrl
    },
    bankPrefix: {
        type: String,
        required: true
    },
    owners: {
        type: String,
        required: true
    },
    jwksUrl: {
        type: String,
        required: true,
        validate: validateUrl
    }
}))