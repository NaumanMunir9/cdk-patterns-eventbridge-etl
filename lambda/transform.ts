import * as AWS from "aws-sdk";

AWS.config.region = process.env.AWS_REGION || "us-east-1";

const eventBridge = new AWS.EventBridge();

export async function handler(event: any) {
  console.log(`Received event: ${JSON.stringify(event)}`);

  const headers: string = event.details.headers;
  const data: string = event.details.data;

  let headersArray = headers.split(",");
  let dataArray = data.split(",");
  let transformedObject: any = {};

  for (let i in headersArray) {
    transformedObject[headersArray[i]] = dataArray[i];
  }

  // transform event for event bridge
  const eventBridgeParams: any = {
    Entries: [
      {
        EventBusName: "default",
        Source: "S3-Event-Bridge",
        DetailType: "Transform",
        Time: new Date(),
        Detail: JSON.stringify({
          status: "transformed",
          data: transformedObject,
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
