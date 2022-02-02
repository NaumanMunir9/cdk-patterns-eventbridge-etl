import { Stack, StackProps } from "aws-cdk-lib";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3Notifications from "aws-cdk-lib/aws-s3-notifications";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as events from "aws-cdk-lib/aws-events";
import * as eventsTargets from "aws-cdk-lib/aws-events-targets";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

export class EventBridgeEtlStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ========================================================================
    // Lambda Throttle size, if left unchecked, this pattern could "fan out" on the transform and load lambdas to the point that it consumes all the available resources on the account. this is wht we are limiting concurrency to 2 on all 3 lambdas.
    // ========================================================================
    const LAMBDA_THROTTLE_SIZE = 2;

    // ========================================================================
    // Provides a DynamoDB table
    // this is where our transformed data will be stored
    // ========================================================================
    const dynamodbTable = new dynamodb.Table(this, "DynamodbTable", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      tableName: "eventbridge-etl-table",
      writeCapacity: 1,
      readCapacity: 1,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========================================================================
    // An S3 bucket with associated policy objects
    // this is where the user uploads the file to be transformed
    // ========================================================================
    const s3Bucket = new s3.Bucket(this, "S3Bucket");

    // ========================================================================
    // A new Amazon SQS queue
    // queue that listens for the S3 bucket events
    // ========================================================================
    const sqsQueue = new sqs.Queue(this, "SqsQueueS3Bucket", {
      queueName: "eventbridge-etl-queue",
      visibilityTimeout: cdk.Duration.seconds(300),
    });

    // ========================================================================
    // Adds a bucket notification event destination
    // s3bucket event notification for the sqsQueue
    // ========================================================================
    s3Bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED, // Amazon S3 APIs such as PUT, POST, and COPY can create an object. Using these event types, you can enable notification when an object is created using a specific API, or you can use the s3:ObjectCreated:* event type to request notification regardless of the API that was used to create an object.
      new s3Notifications.SqsDestination(sqsQueue) // Use an SQS queue as a bucket notification destination
    );

    // ========================================================================
    // Represents a statement in an IAM policy document
    // eventBridge IAM PutEvents policyStatement
    // ========================================================================
    const eventBridgeIamPolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["events:PutEvents"],
      resources: ["*"],
    });

    /**
     * Fargate is used here because it is the most performant way to run a lambda such that if you had a large file, you could stream the data to fargate for as long as you needed to before putting it into eventBridge or up the memory/storage to download the whole file.
     * Lambda has limitations on runtime and memory/storage, so if you have a large file, you will need to use fargate.
     */

    // ========================================================================
    // Vpc creates a VPC that spans a whole region. It will automatically divide the provided VPC CIDR range, and create public and private subnets per Availability Zone. Network routing for the public subnets will be configured to allow outbound access directly via an Internet Gateway. Network routing for the private subnets will be configured to allow outbound access via a set of resilient NAT Gateways (one per AZ).
    // vpc for the ECS cluster
    // ========================================================================
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
    });

    // ========================================================================
    // A log driver that sends log information to CloudWatch Logs
    // Creates a log driver configuration that sends log information to CloudWatch Logs
    // ========================================================================
    const ecsLogDriver = ecs.AwsLogDriver.awsLogs({
      streamPrefix: "eventbridge-etl", // The awslogs-stream-prefix option allows you to associate a log stream with the specified prefix, the container name, and the ID of the Amazon ECS task to which the container belongs
      logRetention: logs.RetentionDays.ONE_WEEK, // The number of days log events are kept in CloudWatch Logs when the log group is automatically created by this construct
    });

    // ========================================================================
    // Constructs a new instance of the Cluster class
    // ========================================================================
    const ecsCluster = new ecs.Cluster(this, "EcsCluster", {
      vpc, // The VPC where your ECS instances will be running or your ENIs will be deployed
    });

    // ========================================================================
    // Constructs a new instance of the FargateTaskDefinition class.
    // ========================================================================
    const ecsTaskDefinition = new ecs.FargateTaskDefinition(
      this,
      "EcsTaskDefinition",
      {
        cpu: 256, // The number of vCPUs to reserve for the container
        memoryLimitMiB: 512, // The amount (in MiB) of memory to reserve for the container
      }
    );

    // ========================================================================
    // Adds a policy statement to the task IAM role.
    // ========================================================================
    ecsTaskDefinition.addToTaskRolePolicy(eventBridgeIamPolicyStatement);

    // ========================================================================
    // Grant read permissions for this bucket and it's contents to an IAM principal (Role/Group/User).
    // ========================================================================
    s3Bucket.grantRead(ecsTaskDefinition.taskRole);

    // ========================================================================
    // Adds a new container to the task definition
    // ========================================================================
    let container = ecsTaskDefinition.addContainer("EcsContainer", {
      image: ecs.ContainerImage.fromAsset("container/s3DataExtractionTasks"), // The image used to start a container.
      logging: ecsLogDriver, // The log driver to use for the container.
      environment: {
        // The environment variables to pass to the container.
        // The key is the environment variable name and the value is the value of the environment variable.
        S3_BUCKET_NAME: s3Bucket.bucketName,
        S3_OBJECT_KEY: "",
      },
    });

    // ========================================================================
    // Deploys a file from inside the construct library as a function
    // ========================================================================
    const extractLambda = new lambda.Function(this, "ExtractLambda", {
      code: lambda.Code.fromAsset("lambda"), // The source code of your Lambda function.
      handler: "extract.handler", // The name of the function (within your source code) that Lambda calls to start running your code.
      runtime: lambda.Runtime.NODEJS_14_X, // The runtime environment for the Lambda function that you are uploading.
      reservedConcurrentExecutions: LAMBDA_THROTTLE_SIZE, // The number of simultaneous executions of your function that can be run without the function consuming the reserved concurrent execution units.
      environment: {
        // The environment variables that your Lambda function is given.
        CLUSTER_NAME: ecsCluster.clusterName,
        TASK_DEFINITION: ecsTaskDefinition.taskDefinitionArn,
        SUBNETS: JSON.stringify(
          Array.from(vpc.publicSubnets, (subnet) => subnet.subnetId)
        ),
        CONTAINER_NAME: container.containerName,
      },
    });

    // ========================================================================
    // grantConsumerMessage
    // ========================================================================
    sqsQueue.grantConsumeMessages(extractLambda);

    // ========================================================================
    // Adds a new event source mapping to the Lambda function
    // Adds an event source to this function
    // ========================================================================
    extractLambda.addEventSource(
      new lambdaEventSources.SqsEventSource(sqsQueue)
    ); // Use an Amazon SQS queue as an event source for AWS Lambda.

    // ========================================================================
    // Adds a statement to the IAM role assumed by the instance
    // ========================================================================
    extractLambda.addToRolePolicy(eventBridgeIamPolicyStatement);

    // ========================================================================
    // Represents a statement in an IAM policy document
    // ========================================================================
    const runTaskPolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["ecs:RunTask"],
      resources: [ecsTaskDefinition.taskDefinitionArn],
    });

    // ========================================================================
    // Adds a statement to the IAM role assumed by the instance.
    // ========================================================================
    extractLambda.addToRolePolicy(runTaskPolicyStatement);

    // ========================================================================
    // Represents a statement in an IAM policy document
    // ========================================================================
    const taskExecutionRolePolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["iam:PassRole"],
      resources: [
        ecsTaskDefinition.obtainExecutionRole().roleArn,
        ecsTaskDefinition.taskRole.roleArn,
      ],
    });

    // ========================================================================
    // Adds a statement to the IAM role assumed by the instance
    // ========================================================================
    extractLambda.addToRolePolicy(taskExecutionRolePolicyStatement);

    // ========================================================================
    // Adds a statement to the IAM role assumed by the instance
    // ========================================================================
  }
}
