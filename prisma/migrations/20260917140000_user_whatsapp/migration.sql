-- Seller onboarding step 1 collects the WhatsApp number before a Seller row
-- exists; it lives on the User until the business step copies it across.
ALTER TABLE "User" ADD COLUMN "whatsapp" TEXT;
