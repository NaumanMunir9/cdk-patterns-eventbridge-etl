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
    // ========================================================================
    const s3Bucket = new s3.Bucket(this, "S3Bucket");

    // ========================================================================
    // A new Amazon SQS queue
    // ========================================================================
    const sqsQueue = new sqs.Queue(this, "SqsQueueS3Bucket", {
      queueName: "eventbridge-etl-queue",
      visibilityTimeout: cdk.Duration.seconds(300),
    });
  }
}
