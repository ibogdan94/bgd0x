# Deploying bgd0x to AWS Amplify (Gen 2)

The app is **backend-agnostic**: with `STATE_TABLE` unset it uses local files (dev);
with `STATE_TABLE` set it uses DynamoDB. The Amplify backend provisions the table +
three EventBridge-scheduled Lambdas that reuse the same task logic in `lib/`.

## Architecture on AWS
- **DynamoDB** `bgd0x-state` (single table, pk/sk) — drafts, queue, schedule, OAuth tokens, news-seen, posted log.
- **Lambdas** (EventBridge schedules): `scheduler` (every 15 min → posts one due slot), `news` (hourly → drafts reactions), `generate` (daily 13:00 UTC → drafts content).
- **Amplify Hosting** runs the Next.js site (login gate + compose + approval queue).

## One-time setup
1. Install & sign in:
   ```
   npm i -g @aws-amplify/backend-cli   # or use npx
   npx ampx configure profile           # AWS creds
   ```
2. Set backend secrets (used by the Lambdas):
   ```
   npx ampx sandbox secret set ClientId
   npx ampx sandbox secret set ClientSecret
   npx ampx sandbox secret set ANTHROPIC_API_KEY
   ```
3. Deploy backend to a personal sandbox to test:
   ```
   npx ampx sandbox
   ```
   This creates the DynamoDB table and the scheduled Lambdas. Watch CloudWatch logs.

## Seed the OAuth tokens into DynamoDB (one time)
The Lambdas read tokens from the `config/tokens` item. Put your current tokens there:
```
aws dynamodb put-item --table-name bgd0x-state --item '{
  "pk":{"S":"config"},"sk":{"S":"tokens"},
  "AccessToken":{"S":"<AccessToken from .env>"},
  "RefreshToken":{"S":"<RefreshToken from .env>"}
}'
```
(After this, refreshes are written back to DynamoDB automatically.)

## Hosting (the Next.js site)
1. Connect the repo in the Amplify console (or `git push` to a branch Amplify tracks). `amplify.yml` builds both backend and frontend.
2. In the Amplify app's **Environment variables**, set (these feed the SSR API routes):
   ```
   STATE_TABLE=bgd0x-state
   AWS_REGION=us-east-1
   ClientId=...          ClientSecret=...
   ANTHROPIC_API_KEY=...  AI_MODEL=claude-opus-4-8
   DASH_EMAIL=bgd0x777@gmail.com  DASH_PASSWORD=...  AUTH_SECRET=...
   EXCHANGE=WhiteBIT
   REF_LINK=https://whitebit.com/referral/a674ee49-bfd5-4e01-a1b9-886890453979
   ```
3. Grant the **SSR compute role** DynamoDB access to `bgd0x-state` (the login/compose/approve API routes read & write it). In the Amplify console → app settings → IAM, attach a policy allowing `dynamodb:*Item`/`Query` on the table ARN.

## Notes
- Secrets: Lambda functions read `ClientId`/`ClientSecret`/`ANTHROPIC_API_KEY` from Amplify secrets (step 2). The hosting SSR reads them from env vars (step 2 of Hosting).
- `esbuild` postinstall may need approval locally (`npm approve-scripts esbuild`); Amplify CI handles it.
- Schedules are in `amplify/functions/*/resource.ts` (cron). Adjust cadence there.
