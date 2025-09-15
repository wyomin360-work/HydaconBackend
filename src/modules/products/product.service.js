const Product = require('../../schemas/product.schema')
const { sendFailResponse } = require('../../utils/responseHandlers')

async function getProduct(productId) {
    const product = await Product.findById(productId).lean()
    if(!product) sendFailResponse("product not found")
    return { data: product }
}

async function productList(data) {
    const { page = 1, limit = 10 } = data
    const skip = (page - 1) * limit
    const products = await Product.find().skip(skip).limit(limit).lean() ?? []
    const totalProducts = await Product.countDocuments();
    return {
        data: {
            products,
            limit,
            totalPages: Math.ceil(totalProducts / limit),
            total: totalProducts,
            page,
        }
    }
}

async function createProduct(productData) {
    const { name, description, image, price, rewardPoints , netWeight } = productData
    await Product.create({
        name,
        description,
        image,
        price,
        rewardPoints,
        netWeight
    })
    return { message: 'Product created', data: { productCreated: true } }
}

async function updateProduct(productData, productId) {
    const { name, description, image, price, rewardPoints,netWeight , active} = productData
    await Product.findByIdAndUpdate(productId, {
        name,
        description,
        image,
        price,
        rewardPoints,
        netWeight,
        active
    })
    return { message: 'Product updated', data: { productUpdated: true } }
}

async function deleteProduct(productId) {
    await Product.findByIdAndDelete(productId)
    return { message: 'Product deleted', data: { productDeleted: true } }
}

module.exports = {
    createProduct,
    updateProduct,
    getProduct,
    productList,
    deleteProduct
}