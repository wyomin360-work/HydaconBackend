const { default: axios } = require("axios")
const { sendFailResponse } = require("../utils/responseHandlers")

const BASE_URL = process.env.RAZORPAY_IFSC_BASE_URL

async function validateIFSC(ifscCode) {
    try {
        const response = await axios({
            method: 'GET',
            url: `${BASE_URL}/${ifscCode}`
        })
        if (!response?.data) {
            return false
        }
        return response?.data
    } catch (error) {
        console.log(error);
        return false
    }

}

module.exports = { validateIFSC }