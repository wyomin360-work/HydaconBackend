const AppConfig = require("../../schemas/app-config.schema");
const { sendFailResponse } = require("../../utils/responseHandlers");


async function appConfigurations() {
    const config = await AppConfig.find().lean()
    if (!config || !config[0]) sendFailResponse('Failed to get app config')
    return { appConfig: config[0] }
}

async function updateAppConfig(updateData, adminId) {
    const config = await AppConfig.find().lean()
    if (!config || !config[0]) sendFailResponse('Failed to get app config')

    updateData.lastUpdated = new Date();
    updateData.lastUpdatedBy = adminId;

    await AppConfig.findOneAndUpdate({},
        { $set: updateData },
        { new: true }
    );
    return { message: "App configuration updated", data: { appConfigUpdated: true } }
}

module.exports = {
    appConfigurations,
    updateAppConfig
}