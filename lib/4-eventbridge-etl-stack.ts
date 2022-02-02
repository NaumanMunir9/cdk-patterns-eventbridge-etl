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
  }
}
