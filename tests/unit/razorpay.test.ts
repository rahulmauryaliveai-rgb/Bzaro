import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyPaymentSignature, verifyWebhookSignature } from "@/lib/payments/razorpay";
import { quantityBand } from "@/server/services/order.service";

/**
 * Payment signature verification.
 *
 * This is the check that stands between "the browser said it paid" and an
 * order being marked paid, so the cases that matter are the forgeries: a
 * signature for a different order, a different amount of data, or none at all.
 */

const config = {
  keyId: "rzp_test_abc123",
  keySecret: "secret-key",
  webhookSecret: "webhook-secret",
};

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

describe("verifyPaymentSignature", () => {
  const orderId = "order_ABC";
  const paymentId = "pay_XYZ";

  it("accepts a signature Razorpay would have produced", () => {
    const signature = sign(config.keySecret, `${orderId}|${paymentId}`);
    expect(verifyPaymentSignature(config, { orderId, paymentId, signature })).toBe(true);
  });

  it("rejects a signature for a different payment", () => {
    const signature = sign(config.keySecret, `${orderId}|pay_SOMETHING_ELSE`);
    expect(verifyPaymentSignature(config, { orderId, paymentId, signature })).toBe(false);
  });

  it("rejects a signature for a different order", () => {
    const signature = sign(config.keySecret, `order_OTHER|${paymentId}`);
    expect(verifyPaymentSignature(config, { orderId, paymentId, signature })).toBe(false);
  });

  it("rejects one signed with the wrong secret", () => {
    const signature = sign("not-the-secret", `${orderId}|${paymentId}`);
    expect(verifyPaymentSignature(config, { orderId, paymentId, signature })).toBe(false);
  });

  it("rejects empty and malformed signatures without throwing", () => {
    for (const signature of ["", "abc", "0".repeat(64)]) {
      expect(verifyPaymentSignature(config, { orderId, paymentId, signature })).toBe(false);
    }
  });
});

describe("verifyWebhookSignature", () => {
  const body = '{"event":"payment.captured","payload":{}}';

  it("accepts a body signed with the seller's webhook secret", () => {
    expect(verifyWebhookSignature(config, body, sign(config.webhookSecret, body))).toBe(true);
  });

  it("rejects a body altered after signing", () => {
    const signature = sign(config.webhookSecret, body);
    expect(verifyWebhookSignature(config, `${body} `, signature)).toBe(false);
  });

  it("does not accept the payment secret in place of the webhook secret", () => {
    expect(verifyWebhookSignature(config, body, sign(config.keySecret, body))).toBe(false);
  });
});

describe("quantityBand", () => {
  it("bands quantities so an order cannot be re-identified from an alert", () => {
    expect(quantityBand(1)).toBe("1-10");
    expect(quantityBand(10)).toBe("1-10");
    expect(quantityBand(11)).toBe("11-50");
    expect(quantityBand(200)).toBe("51-200");
    expect(quantityBand(201)).toBe("201-1000");
    expect(quantityBand(5000)).toBe("1000+");
  });

  it("never returns the exact quantity", () => {
    for (const quantity of [7, 42, 137, 999, 4321]) {
      expect(quantityBand(quantity)).not.toBe(String(quantity));
    }
  });
});
