const admin = require('../config/firebase.config')

async function sendFcmNotifications(tokens, title, body, data) {
    const results = { success: [], errors: [] }

    if (!tokens || tokens.length === 0) {
        throw new Error('No FCM tokens provided.');
    }
    const messages = tokens.map((token) => ({
        notification: {
            title,
            body,
        },
        token,
        data: data || {},
    }));

    try {
        const response = await admin.messaging().sendEach(messages);
        response.responses.forEach((res, index) => {
            if (res.success) {
                results.success.push(tokens[index]);
            } else {
                logError('FCM notifications error for notification', res); results.errors.push(tokens[index]);
            }
        });
    } catch (error) {
        logError('FCM notifications error:', error);
        console.log('FCM error', error);
    }
    return results;
}

async function sendFcmNotificationsToTopics(
    topics,
    title,
    body,
    image,
    data,
) {
    const results = {
        success: [],
        errors: [],
    };

    if (!topics || topics.length === 0) {
        throw new Error('No FCM topics provided.');
    }

    const messages = topics.map((topic) => ({
        topic,
        notification: {
            title,
            body,
            image,
        },
        data: data || {},
    }));

    try {
        // Send messages to each topic.

        for (const message of messages) {
            try {
                await admin.messaging().send(message);
                results.success.push(message.topic);
            } catch (error) {
                results.errors.push(message.topic);
                logError(
                    `Failed to send notification to topic: ${message.topic}`,
                    error,
                );
            }
        }
    } catch (error) {
        logError('Error sending FCM notifications to topics:', error);
    }

    return results;
}

module.exports = {
    sendFcmNotifications,
    sendFcmNotificationsToTopics
}