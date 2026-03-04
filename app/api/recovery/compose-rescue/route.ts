import { NextResponse } from "next/server";

/**
 * Stub API endpoint for compose rescue requests.
 *
 * Users can call claimFunds() on RISExComposer directly via the UI.
 * This endpoint serves as a fallback logging mechanism for cases
 * where direct recovery fails or operator intervention is needed.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      sessionId,
      destChainId,
      composerAddress,
      tokenAddress,
      recipientAddress,
      amount,
      guid,
    } = body;

    // Validate required fields
    if (!sessionId || !destChainId || !recipientAddress) {
      return NextResponse.json(
        { error: "Missing required fields: sessionId, destChainId, recipientAddress" },
        { status: 400 },
      );
    }

    // Log the recovery request (operator monitors these logs)
    console.log("[compose-rescue] Recovery request received:", {
      sessionId,
      destChainId,
      composerAddress,
      tokenAddress,
      recipientAddress,
      amount,
      guid,
      timestamp: new Date().toISOString(),
    });

    // TODO: Forward to backend operator queue / notification system
    // e.g. await notifyOperator({ ... })

    return NextResponse.json({ status: "submitted" });
  } catch (err) {
    console.error("[compose-rescue] Failed to process request:", err);
    return NextResponse.json(
      { error: "Failed to process recovery request" },
      { status: 500 },
    );
  }
}
