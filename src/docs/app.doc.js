module.exports = {
    "/app-config/details": {
        get: {
            summary: "Get Application Configuration",
            tags: ["AppConfig"],
            responses: {
                200: {
                    description: "Returns the current app configuration",
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    appConfig: {
                                        type: "object",
                                        properties: {
                                            name: { type: "string", example: "Hydacon App Config" },
                                            currentVersion: { type: "string", example: "1.0.0" },
                                            latestVersion: { type: "string", example: "1.0.2" },
                                            lastUpdated: { type: "string", format: "date-time" },
                                            maintenanceMessage: { type: "string", example: "Maintenance at 2 AM" },
                                            androidUpdateUrl: { type: "string", example: "https://play.google.com/store/apps/details?id=com.hydacon" },
                                            iosUpdateUrl: { type: "string", example: "https://apps.apple.com/app/hydacon-app/id1234567890" },
                                            isAndroidForceUpdate: { type: "boolean", example: false },
                                            isIosForceUpdate: { type: "boolean", example: true },
                                            minimumSupportedVersion: {
                                                type: "object",
                                                properties: {
                                                    android: { type: "string", example: "1.0.0" },
                                                    ios: { type: "string", example: "1.0.0" }
                                                }
                                            },
                                            updateNotes: {
                                                type: "object",
                                                properties: {
                                                    android: { type: "string", example: "Bug fixes and performance improvements." },
                                                    ios: { type: "string", example: "iOS compatibility updates." }
                                                }
                                            },
                                            coinSettings: {
                                                type: "object",
                                                properties: {
                                                    coinValue: { type: "number", example: 1 },
                                                    minWithdrawAmount: { type: "number", example: 100 },
                                                    maxWithdrawAmount: { type: "number", example: 1000 },
                                                    referralBonus: { type: "number", example: 50 }
                                                }
                                            },
                                            lastUpdatedBy: { type: "string", example: "64f7c4d0f1f3c9a431c5d172" }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                404: {
                    description: "App config not found"
                }
            }
        }
    },

    "/app-config/update": {
        patch: {
            summary: "Update Application Configuration",
            tags: ["AppConfig"],
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                currentVersion: { type: "string", example: "1.0.2" },
                                latestVersion: { type: "string", example: "1.0.3" },
                                maintenanceMessage: { type: "string", example: "Server maintenance on Friday night." },
                                isAndroidForceUpdate: { type: "boolean", example: true },
                                isIosForceUpdate: { type: "boolean", example: false },
                                minimumSupportedVersion: {
                                    type: "object",
                                    properties: {
                                        android: { type: "string", example: "1.0.1" },
                                        ios: { type: "string", example: "1.0.0" }
                                    }
                                },
                                coinSettings: {
                                    type: "object",
                                    properties: {
                                        coinValue: { type: "number", example: 1 },
                                        minWithdrawAmount: { type: "number", example: 100 },
                                        maxWithdrawAmount: { type: "number", example: 2000 },
                                        referralBonus: { type: "number", example: 75 }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            responses: {
                200: {
                    description: "App configuration updated successfully",
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    message: { type: "string", example: "App configuration updated" },
                                    data: {
                                        type: "object",
                                        properties: {
                                            appConfigUpdated: { type: "boolean", example: true }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                400: {
                    description: "Invalid update data or admin ID"
                }
            }
        }
    }
};
