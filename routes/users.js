const router = require('express').Router();
const User = require('../models/Users');
const bcrypt = require('bcryptjs');
const {registerValidation} = require('../validation');
const {randnum} = require('../middlewares')

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
n
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

module.exports = router;