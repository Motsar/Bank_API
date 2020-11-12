const Session = require('./models/Sessions');


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





module.exports.randomString = randomString;
module.exports.randnum = randnum;
module.exports.verifyToken = verifyToken;