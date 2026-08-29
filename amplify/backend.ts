import { defineBackend } from "@aws-amplify/backend";
import { Table, AttributeType, BillingMode } from "aws-cdk-lib/aws-dynamodb";
import { scheduler } from "./functions/scheduler/resource";
import { news } from "./functions/news/resource";
import { generate } from "./functions/generate/resource";

const backend = defineBackend({ scheduler, news, generate });

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
for (const fn of [backend.scheduler, backend.news, backend.generate]) {
  table.grantReadWriteData(fn.resources.lambda);
  fn.addEnvironment("STATE_TABLE", table.tableName);
}

// Surfaced so the Next.js hosting compute can be pointed at the same table.
backend.addOutput({ custom: { stateTable: table.tableName, region: stack.region } });
