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





module.exports.randomString = randomString;
module.exports.randnum = randnum;