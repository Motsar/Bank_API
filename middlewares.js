const fetch = require('node-fetch');
const fs = require('fs');
const jose = require('node-jose');
const axios = require('axios');
const Session = require('./models/Sessions');
const transactionModel = require('./models/Transactions');
const bankModel = require('./models/Banks');
const accountModel = require('./models/Accounts');
const { clearTimeout } = require('timers');
require('dotenv').config();


//Generate random session token
function randomString(format){
    let dt = new Date().getTime();
    return format.replace(/[xy]/g, function(c) {
        let r = (dt + Math.random()*16)%16 | 0;
        dt = Math.floor(dt/16);
        return (c=='x' ? r :(r&0x3|0x8)).toString(16);
    });
}
//Generate random account number
function randnum(length) {
    return Math.floor(Math.pow(10, length-1) + Math.random() * 9 * Math.pow(10, length-1));
}


//verify token for each request where user verification is needed
const verifyToken = async function (req, res, next) {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ "error": "Missing Authorization header!" });
    const headerToken = token.split(' ');
    if (!headerToken[1]) return res.status(400).json({ "error": "Invalid Authorization header format!" });
    const sessiontoken = await Session.findOne({ token: headerToken[1] });
    if (!sessiontoken) return res.status(401).json({ "error": "Invalid token" });
    try {
        req.userId = sessiontoken.userId;
        req.token = headerToken[1];
        next();
    } catch (err) {
        res.status(401).json({ "error": "Invalid token" });
    }
};

const processTransactions = async () => {
    // Init jose keystore
    const privateKey = fs.readFileSync('./keys/private.key').toString()
    const keystore = jose.JWK.createKeyStore();
    const key = await keystore.add(privateKey, 'pem')

    // Get pending transactions
    const pendingTransactions = await transactionModel.find({ status: 'pending' })

    if (pendingTransactions.length > 0) {
        console.log("found :" + pendingTransactions.length)
    }

    // Loop through each transaction and send a request
    pendingTransactions.forEach(async transaction => {
        let oServerResponse
            , timeout
            , bankTo


        console.log('loop: Processing transaction...');

        // Calculate transaction expiry time
        transactionExpiryTime = new Date(
            transaction.createdAt.getFullYear(),
            transaction.createdAt.getMonth(),
            transaction.createdAt.getDate()
            + 3);

        if (transactionExpiryTime < new Date) {

            // Set transaction status to failed
            transaction.status = 'failed'
            transaction.statusDetail = 'Timeout reached'
            transaction.save();

            // Go to next transaction
            return
        }

        // Set transaction status to in progress
        transaction.status = 'inProgress'
        transaction.save();

        let bankPrefix = transaction.accountTo.slice(0, 3);
        bankTo = await bankModel.findOne({ bankPrefix })

        let centralBankResult
        if (!bankTo) {
            centralBankResult = exports.refreshBanksFromCentralBank()
        }

        if (typeof centralBankResult !== "undefined" && centralBankResult.error !== 'undefined') {

            console.log('loop: There was an error when tried to reach central bank')
            console.log(centralBankResult.error)

            // Set transaction status back to pending
            transaction.status = 'pending'
            transaction.statusDetail = 'Central bank was down - cannot get destination bank details. More details: ' + centralBankResult.error
            await transaction.save();

            // Go to next transaction
            return

        } else {

            // Attempt to get the destination bank after refresh again
            bankTo = await bankModel.findOne({ bankPrefix })
        }

        if (!bankTo) {

            console.log('loop: WARN: Failed to get bankTo')
            // Set transaction status failed
            transaction.status = 'failed'
            transaction.statusDetail = 'There is no bank with prefix ' + bankPrefix
            transaction.save();

            // Go to next transaction
            return
        }

        // Create jwt
        const jwt = await jose.JWS.createSign({
            alg: 'RS256',
            format: 'compact'
        }, key).update(JSON.stringify({
            accountFrom: transaction.accountFrom,
            accountTo: transaction.accountTo,
            currency: transaction.currency,
            amount: transaction.amount,
            explanation: transaction.explanation,
            senderName: transaction.senderName
        }), 'utf8').final()




        // Send request to remote bank
        try {
            const nock = require('nock')
            let nockScope

            if (process.env.TEST_MODE === 'true') {

                const nockUrl = new URL(bankTo.transactionUrl)

                console.log('Nocking '+ JSON.stringify(nockUrl));

                nockScope = nock(`${nockUrl.protocol}//${nockUrl.host}`)
                    .persist()
                    .post(nockUrl.pathname)
                    .reply(200, {receiverName: 'Sander Salamander'})

            }

            // Actually send the request
            console.log("starting request")
            oServerResponse = await axios.post(bankTo.transactionUrl, { jwt }, { timeout: 2000 })
            console.log("ending request")
            // Debug log
            console.log('loop: Made request to ' + bankTo.transactionUrl + ':');
            console.log(
                'POST ' + (new URL(bankTo.transactionUrl)).pathname + '\n'
                + Object.entries(oServerResponse.config.headers).map((h) => h[0] + ': ' + h[1]).join("\n")
                + '\n\n'
                + JSON.stringify({ jwt }, null, 4))

        } catch (e) {
            console.log('loop: Making request to another bank failed with the following message: ' + e.message)
            let url = e.config.url
            let request = e.request._header + e.config.data;
            let responseFirstLine = e.response.status + ' ' + e.response.statusText
            let responseHeaders = Object.entries(e.response.headers).map((h) => h[0] + ': ' + h[1]).join("\n")
            let responseBody = JSON.stringify(e.response.data)

            let errorText =
                '\nWhile making this request to ' + url + ':\n'
                + '\n---BEGIN REQUEST---\n'
                + request
                + '\n---END REQUEST---\n'
                + '\nThe following response was given:\n'
                + '\n---BEGIN RESPONSE---\n'
                + responseFirstLine + "\n"
                + responseHeaders + "\n"
                + "\n"
                + responseBody
                + '\n---END RESPONSE---\n'

            console.log(errorText)


            transaction.status = 'failed'
            transaction.statusDetail = errorText
            transaction.save()
            return
        }

        // Cancel aborting
        clearTimeout(timeout)

        // Print friendly error messages if something is missing:
        if (!oServerResponse) {
            console.log('loop: Unable to get server response');
        }
        if (!oServerResponse.status) {
            console.log('loop: Unable to get status from server response');
        } else {
            console.log('loop: Server response status was ' + oServerResponse.status);
        }
        if (!oServerResponse.data) {
            console.log('loop: Unable to get body from server response');
        } else {
            console.log('loop: Server response was:');
            console.log(oServerResponse.status + ' ' + oServerResponse.statusText);
            console.log(Object.entries(oServerResponse.request.res.headers).map((h) => h[0] + ': ' + h[1]).join("\n"));
            console.log('');
            console.log(oServerResponse.data);
        }
        if (!oServerResponse.data.receiverName) {
            console.log('loop: Unable to get receiverName from server response body');
        } else {
            console.log('loop: receiverName was ' + oServerResponse.data.receiverName);
        }

        // Log bad responses from server to transaction statusDetail (including missing receiverName property)
        if (oServerResponse.status < 200 || oServerResponse.status >= 300) {
            console.log('loop: Server response status was not positive. Setting transaction status to failed');
            transaction.status = 'failed'
            transaction.statusDetail = typeof oServerResponse.data.error !== 'undefined' ?
                oServerResponse.data.error : JSON.stringify(oServerResponse.data)
            transaction.save()
            return
        }

        if (!oServerResponse.data) {
            console.log('loop: Server did not return JSON or the content-type was not json');
            transaction.status = 'failed'
            transaction.statusDetail = 'No JSON in response. The response was: ' + oServerResponse.data
            transaction.save()
            return
        }

        if (!oServerResponse.data.receiverName) {
            console.log('loop: Server response did not have receiverName. It was: ' + JSON.stringify(oServerResponse.data));
            transaction.status = 'failed'
            transaction.statusDetail = typeof oServerResponse.data.error !== 'undefined' ?
                oServerResponse.data.error : JSON.stringify(oServerResponse.data)
            transaction.save()
            return
        }

        // Add receiverName to transaction
        transaction.receiverName = oServerResponse.data.receiverName

        // Deduct accountFrom
        const account = await accountModel.findOne({ number: transaction.accountFrom })
        account.balance = account.balance - transaction.amount
        account.save();

        // Update transaction status to completed
        console.log('loop: Transaction ' + transaction.id + ' completed')
        transaction.status = 'completed'
        transaction.statusDetail = ''

        // Write changes to DB
        transaction.save()

    }, Error())


    // Call same function again after 1 sec
    setTimeout(exports.processTransactions, 1000)
}

exports.refreshBanksFromCentralBank = async () => {
    let nockAddress;
    let nock;

    // Mock central bank responses in TEST_MODE
    if (process.env.TEST_MODE === 'true') {
        console.log('TEST_MODE=true');
        nock = require('nock')
        nockAddress = nock(process.env.CENTRAL_BANK_URL)
            .persist()
            .get('/banks')
            .reply(200,
                [
                    {
                        "name": "thisBank",
                        "transactionUrl": "http://this23bank.com/transactions/b2b",
                        "bankPrefix": "thi",
                        "owners": "this & that",
                        "jwksUrl": "http://this23bank.com/transactions/jwks"
                    },
                    {
                        "name": "thatBank",
                        "transactionUrl": "https://that32Bank.com/transactions/b2b",
                        "bankPrefix": "tha",
                        "owners": "that & this",
                        "jwksUrl": "https://that32Bank.com/transactions/jwks"
                    }
                ]
            )
    }
    try {
        console.log('Refreshing banks');

        banks = await fetch(`${process.env.CENTRAL_BANK_URL}/banks`, {
            headers: { 'Api-Key': process.env.CENTRAL_BANK_API_KEY }
        })
            .then(responseText => responseText.json())

        console.log('refreshBanksFromCentralBank: CB response was: ' + JSON.stringify(banks));

        // Delete all old banks
        await bankModel.deleteMany()

        // Create new bulk object
        const bulk = bankModel.collection.initializeUnorderedBulkOp();

        // Add banks to queue to be inserted into DB
        banks.forEach(bank => {
            bulk.insert(bank);
        })

        // Start bulk insert
        await bulk.execute();

    } catch (e) {
        console.log('Failed to communicate with the central bank');
        console.log(e.message);
        return { error: e.message }
    }

    return true

}




module.exports.randomString = randomString;
module.exports.randnum = randnum;
module.exports.verifyToken = verifyToken;
module.exports.processTransactions = processTransactions;