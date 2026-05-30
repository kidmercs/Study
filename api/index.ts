// Vercel serverless entry point — imports the pre-built Express app bundle.
// The build step runs `pnpm --filter @workspace/api-server run build` first,
// which produces dist/app.mjs (Express app only, no server.listen).
// @ts-ignore — importing a pre-built .mjs from a relative path
import app from "../artifacts/api-server/dist/app.mjs";
export default app;
