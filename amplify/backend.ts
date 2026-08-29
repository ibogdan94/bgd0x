import { defineBackend } from "@aws-amplify/backend";
import { Table, AttributeType, BillingMode } from "aws-cdk-lib/aws-dynamodb";
import { scheduler } from "./functions/scheduler/resource";
import { news } from "./functions/news/resource";
import { generate } from "./functions/generate/resource";
import { cleanup } from "./functions/cleanup/resource";
import { video } from "./functions/video/resource";
import { storage } from "./storage/resource";

const backend = defineBackend({ scheduler, news, generate, cleanup, video, storage });

// Single-table state store (drafts, queue, schedule, tokens, seen, posted log).
const stack = backend.createStack("bgd0x-state");
const table = new Table(stack, "State", {
  tableName: "bgd0x-state",
  partitionKey: { name: "pk", type: AttributeType.STRING },
  sortKey: { name: "sk", type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: "ttl",
});

// Grant each scheduled function access + tell it the table name.
for (const fn of [backend.scheduler, backend.news, backend.generate, backend.cleanup, backend.video]) {
  table.grantReadWriteData(fn.resources.lambda);
  fn.addEnvironment("STATE_TABLE", table.tableName);
}

// The video function reads uploaded images from the media S3 bucket. Grant it
// here (function -> bucket) rather than via a storage `access` rule, so the
// dependency is one-directional and CloudFormation doesn't see a cycle.
const mediaBucket = backend.storage.resources.bucket;
mediaBucket.grantReadWrite(backend.video.resources.lambda, "media/*");
mediaBucket.grantDelete(backend.video.resources.lambda, "media/*");
backend.video.addEnvironment("MEDIA_BUCKET", mediaBucket.bucketName);

// Surfaced so the Next.js hosting compute can be pointed at the same table + bucket.
backend.addOutput({
  custom: {
    stateTable: table.tableName,
    mediaBucket: mediaBucket.bucketName,
    region: stack.region,
  },
});
