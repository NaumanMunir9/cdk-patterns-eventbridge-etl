import * as AWS from "aws-sdk";

AWS.config.region = process.env.AWS_REGION || "us-east-1";

const eventBridge = new AWS.EventBridge();
const ecs = new AWS.ECS();

export async function handler(event: any) {
  console.log(`Requests: ${JSON.stringify(event, null, 2)}`);

  let records: any[] = event.Records;

  // Extract variables from the environment
  const clusterName = process.env.CLUSTER_NAME;
  if (typeof clusterName == "undefined") {
    throw new Error("CLUSTER_NAME is not defined");
  }

  const taskDefinition = process.env.TASK_DEFINITION;
  if (typeof taskDefinition == "undefined") {
    throw new Error("TASK_DEFINITION is not defined");
  }

  const subnets = process.env.SUBNETS;
  if (typeof subnets == "undefined") {
    throw new Error("SUBNETS is not defined");
  }

  const containerName = process.env.CONTAINER_NAME;
  if (typeof containerName == "undefined") {
    throw new Error("CONTAINER_NAME is not defined");
  }

  console.log(`Cluster Name: ${clusterName}`);
  console.log(`Task Definition: ${taskDefinition}`);
  console.log(`Subnets: ${subnets}`);
  console.log(`Container Name: ${containerName}`);

  const params: any = {
    // Parameters to pass to the ECS Task Definition
    cluster: clusterName,
    taskDefinition: taskDefinition,
    launchType: "FARGATE",
    count: 1,
    platformVersion: "LATEST",
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: JSON.parse(subnets),
        assignPublicIp: "DISABLED",
      },
    },
  };

  /**
   * An event can contain multiple records to be process, i.e. the user could have uploaded 2 files to S3.
   */
  for (let record of records) {
    let payload = JSON.parse(records[record].body);
    console.log(
      `Payload for processing s3 events: ${JSON.stringify(payload, null, 2)}`
    );

    let s3EventRecords = payload.Records;
    console.log(`S3 Event Records: ${JSON.stringify(s3EventRecords, null, 2)}`);

    for (let i in s3EventRecords) {
      let s3Event = s3EventRecords[i];
      console.log(`S3 Event: ${JSON.stringify(s3Event, null, 2)}`);

      // extract variables from event
      const bucketName = s3Event?.s3?.bucket?.name;
      const objectKey = s3Event?.s3?.object?.key;
      const bucketArn = s3Event?.s3?.object?.arn;

      console.log(`Bucket Name: ${bucketName}`);
      console.log(`Object Key: ${objectKey}`);
      console.log(`Bucket ARN: ${bucketArn}`);

      if (
        typeof objectKey != "undefined" &&
        typeof bucketName != "undefined" &&
        typeof bucketArn != "undefined"
      ) {
        params.overrides = {
          containerOverrides: [
            {
              name: containerName,
              environment: [
                {
                  name: "S3_BUCKET_NAME",
                  value: bucketName,
                },
                {
                  name: "S3_OBJECT_KEY",
                  value: objectKey,
                },
              ],
            },
          ],
        };

        let ecsResponse = await ecs
          .runTask(params)
          .promise()
          .catch((err) => {
            throw new Error(err);
          });
        console.log(`ECS Response: ${JSON.stringify(ecsResponse, null, 2)}`);

        // Create an event to be sent to the Event Bridge
        const eventBridgeParams: any = {
          Entries: [
            {
              EventBusName: "default",
              Source: "S3-Event-Bridge",
              DetailType: "S3-Event-Bridge",
              Time: new Date(),
              Detail: JSON.stringify({
                BucketName: bucketName,
                status: "success",
                data: ecsResponse,
              }),
            },
          ],
        };

        // Send the event to the Event Bridge
        const result = await eventBridge
          .putEvents(eventBridgeParams)
          .promise()
          .catch((err) => {
            throw new Error(err);
          });
        console.log(
          `Event Bridge Response: ${JSON.stringify(result, null, 2)}`
        );
      } else {
        console.log(
          `Skipping record ${JSON.stringify(s3EventRecords[i], null, 2)}`
        );
      }
    }
  }
}
