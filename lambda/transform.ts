import * as AWS from "aws-sdk";

AWS.config.update({ region: "us-east-1" });

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
}
