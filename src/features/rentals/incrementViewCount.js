const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const dbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dbClient);
const LISTINGS_TABLE_NAME = process.env.LISTINGS_TABLE_NAME;

exports.handler = async (event) => {
    const { listingId } = event.pathParameters;

    const params = {
        TableName: LISTINGS_TABLE_NAME,
        Key: { listingId },
        UpdateExpression: "SET viewsCount = if_not_exists(viewsCount, :zero) + :inc",
        ExpressionAttributeValues: { 
            ":inc": 1,
            ":zero": 0
        },
        ReturnValues: "NONE",
    };

    try {
        await docClient.send(new UpdateCommand(params));
        return { statusCode: 200, body: JSON.stringify({ success: true }) };
    } catch (error) {
        console.error("Error incrementing view count:", error);
        // We return 200 even on error to not block the frontend.
        // This is a fire-and-forget operation.
        return { statusCode: 200, body: JSON.stringify({ success: false }) };
    }
}; 