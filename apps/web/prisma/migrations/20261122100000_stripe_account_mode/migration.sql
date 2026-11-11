-- Wechsel Test → Live: Modus, in dem das Stripe-Konto eines Shops angelegt bzw. zuletzt erreicht wurde
ALTER TABLE "Shop" ADD COLUMN "stripeAccountMode" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "stripeMode" TEXT;
