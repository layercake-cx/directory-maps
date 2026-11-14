/** One constant so the assistant can be renamed without a hunt. The top bar keeps the Layercake Maps logo; Pip appears only as the assistant. */
export const ASSISTANT_NAME = "Pip";

/** sessionStorage key for a workspace's conversation: assistant:{clientId|platform}. */
export const conversationKey = (clientId) => `assistant:${clientId || "platform"}`;
export const NOTICE_SEEN_KEY = "assistant:notice-seen";

/** Staff-only commands that reach the error and unavailable states so they can be reviewed in the mock. */
export const TEST_COMMANDS = { error: "/error", unavailable: "/unavailable" };
