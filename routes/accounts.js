const router = require('express').Router();
const User =require('../models/Users');
const Accounts = require('../models/Accounts')
const {verifyToken, randnum} = require('../middlewares');
const {accountsValidation} = require('../validation');

//Userinfo
router.get('/',verifyToken, async(req, res) => {
    const user = await User.findOne({_id:req.userId});
    const accounts = await Accounts.find({userId:req.userId}).select('name -_id currency number balance').exec();
    try{
        res.status(200).json(
            {
                firstname:user.firstname,
                lastname:user.lastname,
                email:user.email,
                Accounts:accounts
            }
        )
    }catch(err){
        res.status(400).send(err);
    }
})

//Create account to user
router.post('/', verifyToken, async (req, res)=>{
    const {error} = accountsValidation(req.body);
    if(error) return res.status(400).json({"error":error.details[0].message});

    if(req.body.balance.length()==0) return res.status(400).json({"error":"balance is required"});

    const accountNr = process.env.BANK_PREFIX+""+randnum(8).toString();
    const account = new Accounts({
        name: req.body.name,
        balance: req.body.balance,
        number: accountNr,
        userId: req.userId
    });
    try{
        const savedAccount = await account.save();
        res.status(200).json({"user": req.userId, "account_nr":account.number});
    }catch(err){
        res.status(401).json({error: err});
    }
})


//Delete account from user
router.delete('/', verifyToken, async (req, res)=>{
    const account = await Accounts.findOne({number: req.body.number});
    console.log(req.body.number);
    if(!account) return res.status(401).json({error: "Invalid account number"});
    if(account.balance>0) return res.status(401).json({error: "You need to transfer money from your account, before deleting it!"});
    try{

        const deleteAcc = await Accounts.deleteOne({_id:account._id});
        res.status(200).json({"message":"account by the name "+ req.body.number + " was removed!"});
    }catch(err){
        res.status(401).json({error: err});
    }

})

module.exports = router;