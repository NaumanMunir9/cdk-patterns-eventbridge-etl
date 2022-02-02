import * as AWS from "aws-sdk";

AWS.config.region = process.env.AWS_REGION || "us-east-1";

const eventBridge = new AWS.EventBridge();
const dynamodb = new AWS.DynamoDB();

export async function handler(event: any) {
  console.log(`Requests: ${JSON.stringify(event, null, 2)}`);

  const params = {
    TableName: process.env.TABLE_NAME || "",
    Item: {
      id: {
        S: event.detail.data.ID,
      },
      house_number: {
        S: event.detail.data.HouseNum,
      },
      street_address: {
        S: event.detail.data.Street,
      },
      town: {
        S: event.detail.data.Town,
      },
      zip: {
        S: event.detail.data.Zip,
      },
    },
  };

  // Put the item into the table
  const result = await dynamodb.putItem(params).promise();
  console.log(`Result: ${JSON.stringify(result, null, 2)}`);

  // Create an event to be sent to the Event Bridge
  const eventBridgeParams: any = {
    Entries: [
      {
        EventBusName: "default",
        Source: "S3-Event-Bridge",
        DetailType: "S3-Event-Bridge",
        Time: new Date(),
        Detail: JSON.stringify({
          status: "success",
          data: params,
        }),
      },
    ],
  };

  // Send the event to the Event Bridge
  const eventBridgeResult = await eventBridge
    .putEvents(eventBridgeParams)
    .promise()
    .catch((err) => {
      throw new Error(err);
    });
  console.log(
    `Event Bridge Response: ${JSON.stringify(eventBridgeResult, null, 2)}`
  );
}
