const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET

const handleError = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};


// BCRYPT
const hashData = (rawData, salt = 10) => {
    return new Promise((resolve, reject) => {
        bcrypt.hash(rawData, salt, (err, hash) => {
            if (err) {
                reject(err);
            } else {
                resolve(hash);
            }
        });
    });
};

const compareHash = (rawData, hashData) => {
    return new Promise((resolve, reject) => {
        bcrypt.compare(rawData, hashData, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
};

// JWT
const generateToken = (payload, expiresIn = '1d') => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn })
}

const verifyToken = (token) => {
    return jwt.verify(token, JWT_SECRET)
}


// Generate a random 4-character hex string
const randomHex = () => Math.floor(Math.random() * 0xFFFF).toString(16).padStart(4, '0');


module.exports = {
    handleError,
    hashData,
    verifyToken,
    generateToken,
    compareHash,
    randomHex
}