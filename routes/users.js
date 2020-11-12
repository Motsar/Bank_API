const router = require('express').Router();
const User = require('../models/Users');
const Session = require('../models/Sessions');
const Account = require('../models/Accounts');
const bcrypt = require('bcryptjs');
const {registerValidation,loginValidation} = require('../validation');
const {randomString,randnum,verifyToken} = require('../middlewares')

//Create a new user
router.post('/users', async (req,res)=> {

    //Lets validate data before adding a user
    const {error} = registerValidation(req.body);
    if(error) return res.status(400).send(error.details[0].message);

    //Checking if the user is already in database
    const emailExists = await User.findOne({email: req.body.email});
    if(emailExists) return res.status(401).json({"error": "Email allready exists!"});

    //Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(req.body.password, salt);

    //Generate a new bank number
    const accountNr = process.env.BANK_PREFIX+""+randnum(8).toString();


    //create a new user
    const user = new User({
        firstname: req.body.firstname,
        lastname: req.body.lastname,
        email: req.body.email,
        password: hashedPassword
    });


    try{
        const savedUser = await user.save();
        const account = new Account({
            name:"main",
            balance: 150000,
            number: accountNr,
            userId: user._id
        });
        const savedAccount = await account.save();
        res.status(201).json({user: user._id, account_nr:account.number});
    }catch(err){
        res.json({error:err});
    }
});

//User login

router.post('/sessions', async (req,res)=>{
    //Lets validate data before user login
    const {error} = loginValidation(req.body);
    if(error) return res.status(400).send(error.details[0].message);
    //Checking if email exists
    const user = await User.findOne({email: req.body.email});
    if(!user) return res.status(401).json({"error":"Email or password is invalid!"});
    //Password
    const validPass = await bcrypt.compare(req.body.password, user.password);
    if(!validPass) return res.status(401).json({"error":"Email or password is invalid!"});
    const sessions = await Session.findOne({userId:user._id});
    if(sessions) return res.status(403).json({"error":"You are already logged in!"});
    let tokenString = randomString('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx');

    //Create and asign a token
    const session = new Session({
        userId: user._id,
        token: tokenString,
    });
    try{
        const savedSession = await session.save();
        res.status(200).json({access_token: tokenString});
    }catch(err){
        res.status(400).json({error:err});
    }
});

//User logout
router.delete('/sessions',verifyToken, async (req,res) =>{
    try{
        const sessionID = await Session.findOne({token: req.token});
        const removeSession = await Session.deleteOne({_id: sessionID._id});
        res.status(201).json({"message" :"You have logged out!"});
    }catch(err){
        res.status(400).json({ "message" : err});
    }
});

module.exports = router;