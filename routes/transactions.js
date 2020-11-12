const router = require('express').Router();
const axios = require('axios');
const jose = require('node-jose');
const fs = require('fs');
const merge = require('lodash.merge');
const User = require('../models/Users');
const fetch = require('node-fetch');
const Account = require('../models/Accounts');
const Transactions = require('../models/Transactions');
const Banks = require('../models/Banks');
const { verifyToken, refreshBanksFromCentralBank } = require('../middlewares');
const { transferValidation } = require('../validation');


router.post('/', verifyToken, async (req, res) => {
    let statusdetail;

    const { error } = transferValidation(req.body);
    if (error) return res.status(400).send(error.details[0].message);

    const user = await User.findOne({ _id: req.userId });


    const findAccountFrom = await Account.findOne({ number: req.body.accountFrom });
    //Check if account from exists
    if (!findAccountFrom) return res.status(404).json({ "error": "Account not found" });

    //Check if account belongs to user
    if (findAccountFrom.userId !== req.userId) return res.status(403).json({ "error": "Forbidden" });
    const amount = req.body.amount;

    //Check if sender has enough money for transaction
    if (amount > findAccountFrom.balance) return res.status(402).json({ "error": "Insufficient funds" });

    //Check if transaction amount is valid
    if (amount <= 0) return res.status(400).json({ "error": "Invalid amount" });



    //In Bank transactions
    if (process.env.BANK_PREFIX === req.body.accountTo.slice(0, 3)) {
        const transaction = new Transactions({
            senderName: user.firstname + " " + user.lastname,
            accountFrom: findAccountFrom.number,
            recieverName: req.body.recieverName,
            accountTo: req.body.accountTo,
            amount: amount,
            currency: findAccountFrom.currency,
            explanation: req.body.explanation,
        })
        const findAccountTo = await Account.findOne({ number: req.body.accountTo });
        let accountFromBalance = findAccountFrom.balance - amount;
        let accountToBalance = findAccountTo.balance + amount;
        //Check if reciever account exists
        if (!findAccountTo) return res.status(404).json({ "error": "invalid account number" });
        try {
            const savedTransactionLog = await transaction.save();
            const changeSenderBalance = await Account.updateOne({ _id: findAccountFrom._id },
                {
                    $set: {
                        balance: accountFromBalance
                    }
                });
            const changeRecieverBalance = await Account.updateOne({ _id: findAccountTo._id },
                {
                    $set: {
                        balance: accountToBalance
                    }
                });
            const changeTransactionStatus = await Transactions.updateOne({ accountFrom: findAccountFrom.number, accountTo: findAccountTo.number, status: 'pending' },
                {
                    $set: {
                        status: 'completed'
                    }
                });

            res.json(req.body)
        } catch (err) {
            res.send(err);
        }

    } else {
        //Outside home bank transactions
        let bankTo = await Banks.findOne({ bankPrefix: req.body.accountTo.slice(0, 3) });
        if (!bankTo) {

            //Refresh banks from central bank
            const result = await refreshBanksFromCentralBank();

            //Check if there was an error
            if (typeof result.error !== 'undefined') {

                //Log the error to transaction
                console.log('There was an error communicating with central bank:')
                console.log(result.error)
                statusdetail = result.error
            } else {
                //Try getting the details of the destination bank again
                bankTo = await Banks.findOne({ bankPrefix: req.body.accountTo.slice(0, 3) });

                //Check for destination bank one more time
                if (!bankTo) {
                    return res.status(400).json({ error: "Invalid accountTo" });
                }
            }
        } else {
            console.log("Destination bank was found in cache");
        }
        console.log('Creating transaction...')
        try {
            const transaction = await Transactions.create({
                senderName: user.firstname + " " + user.lastname,
                accountFrom: findAccountFrom.number,
                recieverName: req.body.recieverName,
                accountTo: req.body.accountTo,
                amount: amount,
                currency: findAccountFrom.currency,
                explanation: req.body.explanation,
                statusDetail: statusdetail
            })
        } catch (err) {
            console.log(err)
            res.status(500).json({"error": err.message})
        }
        console.log("transaction created")
        return res.status(201).json()
    }
})

router.post('/b2b', async (req, res, next) => {


    console.log('/b2b: Started processing incoming transaction request')

    let transaction

    // Get jwt from body
    jwt = req.body.jwt

    // Extract transaction from jwt (payload)
    try {

        // Get the middle part of JWT
        const base64EncodedPayload = jwt.split('.')[1];

        // Decode it and parse it to a transaction object
        transaction = JSON.parse(Buffer.from(base64EncodedPayload, 'base64').toString());

        console.log('/b2b: Received this payload: ' + JSON.stringify(transaction))

    } catch (e) {
        return res.status(400).json({ error: 'Parsing JWT payload failed: ' + e.message })
    }

    // Extract accountTo
    const accountTo = await Account.findOne({ number: transaction.accountTo })


    // Verify accountTo
    if (!accountTo) {
        return res.status(404).json({ error: 'Account not found' })
    }

    console.log('/b2b: Found this account: ' + JSON.stringify(accountTo))

    // Get bank's prefix from accountFrom
    const bankFromPrefix = transaction.accountFrom.substring(0, 3)
    console.log('/b2b: Prefix of accountFrom is: ' + bankFromPrefix)

    // Get bank's data by prefix
    let bankFrom = await Banks.findOne({ bankPrefix: bankFromPrefix })

    // Update our banks collection, if this is a new bank
    if (!bankFrom) {

        console.log('/b2b: Didn\'t find bankFrom from local bank list')

        // Refresh banks from central bank
        console.log('/b2b: Refreshing local bank list')
        const result = await refreshBanksFromCentralBank();

        // Check if there was an error
        if (typeof result.error !== 'undefined') {

            // Console the error
            console.log('/b2b: There was an error communicating with central bank: ' + result.error)

            // Fail with error
            return res.status(502).json({ error: 'Central Bank error: ' + result.error })

        }

        // Try getting the details of the destination bank again
        console.log('/b2b: Attempting to get bank from local bank list again')
        bankFrom = await Banks.findOne({ bankPrefix: bankFromPrefix })

        // Fail with error if the bank is still not found
        if (!bankFrom) {

            console.log('/b2b: Still didn\'t get the bank. Failing now')

            return res.status(400).json({
                error: 'The account sending the funds does not belong to a bank registered in Central Bank'
            })
        }

    }

    console.log('/b2b: Got bank details: ' + JSON.stringify(bankFrom))

    // Get bank's jwksUrl
    if (!bankFrom.jwksUrl) {
        console.log('/b2b: bankFrom does not have jwksUrl: ' + JSON.stringify(bankFrom))
        return res.status(500).json({ error: 'Cannot verify your signature: The jwksUrl of your bank is missing' })
    }

    // Get bank's public key
    let keystore
    try {

        // Get the other bank's public key
        console.log(`/b2b: Attempting to contact jwksUrl of ${bankFrom.name}...`)
        const response = await axios.get(bankFrom.jwksUrl);

        // Import it to jose
        console.log('/b2b: Importing its public key to our keystore')
        keystore = await jose.JWK.asKeyStore(response.data)

    } catch (e) {
        console.log(`/b2b: Importing of the other bank's public key from ${bankFrom.jwksUrl} failed: ` + e.message)
        return res.status(400).json({ error: `Cannot verify your signature: The jwksUrl of your bank (${bankFrom.jwksUrl}) is invalid: ` + e.message })
    }

    // Verify that the signature matches the payload and it's created with the private key of which we have the public version
    console.log('/b2b: Verifying signature')
    try {
        await jose.JWS.createVerify(keystore).verify(jwt)
    } catch (e) {
        return res.status(400).json({ error: 'Invalid signature' })
    }

    // Write original amount to amount
    let amount = transaction.amount

    // Convert amount from another currency, if needed
    if (accountTo.currency !== transaction.currency) {

        console.log('/b2b: Currency needs conversion')

        // Get the currency rate
        const rate = await require('exchange-rates-api')
            .exchangeRates().latest()
            .base(transaction.currency)
            .symbols(accountTo.currency)
            .fetch();

        console.log(`/b2b: Looks like 1 ${transaction.currency} = ${rate} ${accountTo.currency}`)

        // Convert strings to numbers, convert currency, round the result to full cents (makes it a string) and convert it back to number
        amount = parseInt((parseFloat(rate) * parseInt(amount)).toFixed(0))

    }

    // Get accountTo owner's details
    const accountToOwner = await User.findOne({ _id: accountTo.userId })

    // Increase accountTo's balance
    console.log(`/b2b: Increasing ${accountToOwner.firstname + " " + accountToOwner.lastname}'s account ${accountTo.number} by ${amount / 100} ${accountTo.currency}`)
    accountTo.balance = accountTo.balance + amount

    // Save the change to DB
    accountTo.save()


    // Create transaction
    await Transactions.create({
        userId: accountTo.userId,
        amount: transaction.amount,
        currency: transaction.currency,
        accountFrom: transaction.accountFrom,
        accountTo: transaction.accountTo,
        explanation: transaction.explanation,
        senderName: transaction.senderName,
        receiverName: accountToOwner.firstname + " " + accountToOwner.lastname,
        status: 'completed'
    })

    // Send receiverName
    res.status(200).json({ receiverName: accountToOwner.firstname + " " + accountToOwner.lastname })

})

router.get('/', verifyToken, async (req, res) => {

    // Get user accounts
    let accNumArr = [];
    const userAccounts = await Account.find({ userId: req.userId })
    //Push account numbers into array
    for (let i = 0; i < userAccounts.length; i++) {
        accNumArr.push(userAccounts[i].number);
    }
    //Create empty objects
    let outTransactions = {};
    let inTransactions = {};
    // iterate account numbers array for searching transactions and pushing found transactions into empty transaction objects
    for (let a = 0; a < accNumArr.length; a++) {
        const transactionsOut = await Transactions.find({ accountFrom: accNumArr[a] });
        const transactionsIn = await Transactions.find({ accountTo: accNumArr[a] });
        merge(outTransactions, transactionsOut);
        merge(inTransactions, transactionsIn);
    }
    console.log(outTransactions);
    console.log(inTransactions);
    res.status(200).json({
        OutgoingTransactions: outTransactions,
        inComingTransactions: inTransactions
    });

})

router.get('/jwks', async (req, res, next) => {

    // Create new keystore
    console.log('/jwks: Creating keystore')
    const keystore = jose.JWK.createKeyStore();

    // Add our private key from file to the keystore
    console.log('/jwks: Reading private key from disk and adding it to keystore')
    await keystore.add(fs.readFileSync('./keys/private.key').toString(), 'pem')

    // Return our keystore (only the public key derived from the imported private key) in JWKS (JSON Web Key Set) format
    console.log('/jwks: Exporting keystore and returning it')
    return res.send(keystore.toJSON())

})

module.exports = router;